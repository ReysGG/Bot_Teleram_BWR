import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { integerEnv } from "@/server/env";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { getUsdtBep20Setting, getBscRpcConfiguration, BSC_MAINNET_CHAIN_ID } from "@/server/payment/usdt-bep20-setting";
import { getUsdtRateSetting } from "@/server/payment/usdt-rate-setting";
import { cleanError } from "@/server/utils/format";

export const USDT_BEP20_METHOD = "USDT_BEP20" as const;
export const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export class UsdtBep20Error extends Error { constructor(public readonly code: string, message: string) { super(message); this.name = "UsdtBep20Error"; } }
export function normalizeBscTransactionHash(value: string) { const normalized = value.trim().toLowerCase(); if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw new UsdtBep20Error("INVALID_TX_HASH", "Hash transaksi BEP20 tidak valid."); return normalized; }
export type BscRpcClient = { request<T>(method: string, params: unknown[]): Promise<T> };
export function createBscRpcClient(input?: { url?: string; fetchImpl?: typeof fetch }): BscRpcClient {
  const url = input?.url ?? getBscRpcConfiguration().url; const fetchImpl = input?.fetchImpl ?? fetch; let id = 0;
  return { async request<T>(method: string, params: unknown[]) { const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), integerEnv("BSC_RPC_TIMEOUT_MS", 12_000)); try { const response = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }), signal: controller.signal, cache: "no-store" }); if (!response.ok) throw new Error("BSC RPC unavailable"); const payload = await response.json() as { result?: T; error?: unknown }; if (payload.error) throw new Error("BSC RPC error"); return payload.result as T; } finally { clearTimeout(timeout); } } };
}
function hex(value: unknown) { if (typeof value !== "string" || !/^0x[0-9a-fA-F]+$/.test(value)) throw new Error("Invalid RPC hex"); return BigInt(value); }
function topicAddress(value: unknown) { return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) ? `0x${value.slice(-40).toLowerCase()}` : null; }
export async function getUsdtBep20CheckoutConfig() { const [setting, rate] = await Promise.all([getUsdtBep20Setting(), getUsdtRateSetting()]); return { enabled: setting.enabled && Boolean(setting.recipientAddress), recipientAddress: setting.recipientAddress, tokenContract: setting.tokenContract, tokenDecimals: setting.tokenDecimals, chainId: BSC_MAINNET_CHAIN_ID, requiredConfirmations: setting.requiredConfirmations, rate: rate.rate, rateSource: rate.source, rpcSource: setting.rpc.source }; }
export async function createUsdtBep20Order(input: { chatId: string; buyerEmail?: string | null; buyerUsername?: string | null; buyerDisplayName?: string | null; productId: string; idempotencyKey: string; quantity?: number }) { return createDigitalOrder({ ...input, paymentMethod: USDT_BEP20_METHOD }); }
export async function getUsdtBep20AttemptForOrder(input: { orderId: string; chatId?: string }) { const attempt = await prisma.usdtBep20Attempt.findFirst({ where: { orderId: input.orderId, ...(input.chatId ? { order: { chatId: input.chatId } } : {}) }, include: { order: { include: { payment: true, items: { orderBy: { createdAt: "asc" } } } } } }); if (!attempt) throw new UsdtBep20Error("ATTEMPT_NOT_FOUND", "Instruksi USDT BEP20 tidak ditemukan."); return attempt; }
export async function verifyUsdtBep20Attempt(input: { attemptId: string; rpcClient?: BscRpcClient }) {
  const attempt = await prisma.usdtBep20Attempt.findUnique({ where: { id: input.attemptId }, include: { order: { include: { payment: true } } } });
  if (!attempt?.txHash) throw new UsdtBep20Error("ATTEMPT_NOT_FOUND", "Transfer USDT BEP20 tidak ditemukan.");
  if (attempt.status === "CONFIRMED") return { outcome: "CONFIRMED" as const, confirmations: attempt.confirmations ?? 0 };
  if (attempt.status === "REJECTED" || attempt.status === "EXPIRED") return { outcome: "REJECTED" as const, reason: attempt.failureReason ?? "Transfer tidak valid." };
  if (attempt.status === "VERIFIED") { await confirmOrderPayment({ orderId: attempt.orderId, verifiedBy: `usdt-bep20:${attempt.txHash}`, usdtBep20AttemptId: attempt.id }); return { outcome: "CONFIRMED" as const, confirmations: attempt.confirmations ?? attempt.requiredConfirmationsSnapshot }; }
  const now = new Date(); if (attempt.verificationExpiresAt <= now) { await prisma.usdtBep20Attempt.updateMany({ where: { id: attempt.id, status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } }, data: { status: "REJECTED", failureReason: "Waktu verifikasi berakhir.", lastCheckedAt: now } }); return { outcome: "REJECTED" as const, reason: "Waktu verifikasi berakhir." }; }
  try {
    const rpc = input.rpcClient ?? createBscRpcClient();
    if (hex(await rpc.request<string>("eth_chainId", [])) !== 56n) throw new Error("Wrong chain");
    const receipt = await rpc.request<{ status?: string; blockNumber?: string; logs?: Array<{ address?: string; topics?: string[]; data?: string; logIndex?: string }> } | null>("eth_getTransactionReceipt", [attempt.txHash]);
    if (!receipt) { await prisma.usdtBep20Attempt.updateMany({ where: { id: attempt.id, status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } }, data: { status: "VERIFYING", lastCheckedAt: now } }); return { outcome: "PENDING_RPC" as const, confirmations: null }; }
    if (hex(receipt.status) !== 1n) throw new Error("Failed transaction");
    const blockNumber = hex(receipt.blockNumber); const block = await rpc.request<{ timestamp?: string } | null>("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]); if (!block) throw new Error("Missing block");
    const blockTimestamp = new Date(Number(hex(block.timestamp)) * 1000); if (!Number.isFinite(blockTimestamp.getTime()) || blockTimestamp < new Date(attempt.createdAt.getTime() - 120_000) || blockTimestamp > attempt.expiresAt) throw new Error("Outside invoice window");
    const expected = BigInt(attempt.expectedTokenUnits.toString()); const matches = (receipt.logs ?? []).filter((log) => log.address?.toLowerCase() === attempt.tokenContractSnapshot && log.topics?.[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC && topicAddress(log.topics?.[2]) === attempt.recipientAddressSnapshot && typeof log.data === "string" && /^0x[0-9a-fA-F]{64}$/.test(log.data) && BigInt(log.data) === expected);
    if (matches.length !== 1) throw new Error("Transfer mismatch");
    const head = hex(await rpc.request<string>("eth_blockNumber", [])); const confirmations = Number(head - blockNumber + 1n); const logIndex = Number(hex(matches[0].logIndex));
    if (!Number.isSafeInteger(confirmations) || confirmations < 1 || !Number.isSafeInteger(logIndex) || logIndex < 0) throw new Error("Invalid RPC block progress");
    if (confirmations < attempt.requiredConfirmationsSnapshot) { await prisma.usdtBep20Attempt.updateMany({ where: { id: attempt.id, status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } }, data: { status: "PENDING_CONFIRMATIONS", blockNumber, blockTimestamp, confirmations, transferLogIndex: logIndex, lastCheckedAt: now, failureReason: null } }); return { outcome: "PENDING_CONFIRMATIONS" as const, confirmations }; }
    const verified = await prisma.usdtBep20Attempt.updateMany({ where: { id: attempt.id, status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } }, data: { status: "VERIFIED", blockNumber, blockTimestamp, confirmations, transferLogIndex: logIndex, verifiedAt: now, lastCheckedAt: now, failureReason: null } });
    if (verified.count === 0) {
      const current = await prisma.usdtBep20Attempt.findUniqueOrThrow({ where: { id: attempt.id } });
      if (current.status === "CONFIRMED") return { outcome: "CONFIRMED" as const, confirmations: current.confirmations ?? confirmations };
      if (current.status !== "VERIFIED") return { outcome: "PENDING_RPC" as const, confirmations: current.confirmations };
    }
    await confirmOrderPayment({ orderId: attempt.orderId, verifiedBy: `usdt-bep20:${attempt.txHash}`, usdtBep20AttemptId: attempt.id }); return { outcome: "CONFIRMED" as const, confirmations };
  } catch { await prisma.usdtBep20Attempt.updateMany({ where: { id: attempt.id, status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] } }, data: { lastCheckedAt: now, failureReason: "RPC BSC sementara tidak dapat memverifikasi transaksi." } }); return { outcome: "PENDING_RPC" as const, confirmations: attempt.confirmations }; }
}
export async function submitUsdtBep20Transaction(input: { orderId: string; chatId: string; txHash: string; rpcClient?: BscRpcClient }) { const txHash = normalizeBscTransactionHash(input.txHash); let id: string; try { id = await prisma.$transaction(async (tx) => { await lockOrderPaymentTransition(tx, input.orderId); const attempt = await tx.usdtBep20Attempt.findFirst({ where: { orderId: input.orderId, order: { chatId: input.chatId } }, include: { order: { include: { payment: true } } } }); if (!attempt?.order.payment) throw new UsdtBep20Error("ORDER_NOT_FOUND", "Order tidak ditemukan."); if (attempt.txHash === txHash) return attempt.id; if (attempt.status !== "AWAITING_TX_HASH") throw new UsdtBep20Error("TX_HASH_ALREADY_SUBMITTED", "Hash sudah dikirim."); if (attempt.expiresAt <= new Date() || attempt.order.status !== "PENDING_PAYMENT" || attempt.order.paymentStatus !== "PENDING" || attempt.order.payment.status !== "PENDING") throw new UsdtBep20Error("ATTEMPT_EXPIRED", "Invoice kedaluwarsa atau tidak lagi menunggu pembayaran."); if (await tx.usdtBep20Attempt.findUnique({ where: { txHash } })) throw new UsdtBep20Error("TX_HASH_ALREADY_USED", "Hash sudah digunakan."); await tx.usdtBep20Attempt.update({ where: { id: attempt.id }, data: { status: "VERIFYING", txHash, submittedAt: new Date() } }); return attempt.id; }); } catch (error) { if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new UsdtBep20Error("TX_HASH_ALREADY_USED", "Hash sudah digunakan."); throw error; } const verification = await verifyUsdtBep20Attempt({ attemptId: id, rpcClient: input.rpcClient }); return { attempt: await prisma.usdtBep20Attempt.findUniqueOrThrow({ where: { id } }), verification }; }
export async function refreshUsdtBep20Verification(input: { orderId: string; chatId: string; rpcClient?: BscRpcClient }) { const attempt = await prisma.usdtBep20Attempt.findFirst({ where: { orderId: input.orderId, order: { chatId: input.chatId }, txHash: { not: null } }, select: { id: true } }); if (!attempt) throw new UsdtBep20Error("ATTEMPT_NOT_FOUND", "Transfer belum dikirim."); return verifyUsdtBep20Attempt({ attemptId: attempt.id, rpcClient: input.rpcClient }); }
export async function processPendingUsdtBep20Attempts(limit = 25) {
  const attempts = await prisma.usdtBep20Attempt.findMany({ where: { status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"] } }, select: { id: true }, orderBy: [{ lastCheckedAt: "asc" }, { submittedAt: "asc" }], take: Math.min(100, Math.max(1, limit)) });
  const results = [];
  for (const attempt of attempts) {
    try {
      results.push(await verifyUsdtBep20Attempt({ attemptId: attempt.id }));
    } catch (error) {
      // Keep a verified payment retryable without starving the rest of the batch.
      console.warn("[USDT BEP20 worker]", { attemptId: attempt.id, error: cleanError(error) });
    }
  }
  return { checked: attempts.length, results };
}
export async function listUsdtBep20Attempts(input: { status?: "AWAITING_TX_HASH" | "VERIFYING" | "PENDING_CONFIRMATIONS" | "VERIFIED" | "CONFIRMED" | "REJECTED" | "EXPIRED"; search?: string; page?: number; pageSize?: number } = {}) { const page = Math.max(1, input.page ?? 1); const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 20)); const search = input.search?.trim(); const where = { ...(input.status ? { status: input.status } : {}), ...(search ? { OR: [{ txHash: { contains: search, mode: "insensitive" as const } }, { order: { invoiceNumber: { contains: search, mode: "insensitive" as const } } }, { order: { chatId: { contains: search, mode: "insensitive" as const } } }, { order: { buyerUsername: { contains: search, mode: "insensitive" as const } } }] } : {}) }; const [items, total] = await Promise.all([prisma.usdtBep20Attempt.findMany({ where, include: { order: { include: { payment: true, items: { orderBy: { createdAt: "asc" } } } } }, orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }], skip: (page - 1) * pageSize, take: pageSize }), prisma.usdtBep20Attempt.count({ where })]); return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) }; }
