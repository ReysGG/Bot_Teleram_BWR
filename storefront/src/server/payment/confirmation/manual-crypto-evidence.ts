import type { Prisma } from "@/generated/prisma/client";
import { binanceOrderIdValueAliases } from "../binance-order-id";
import { ManualCryptoApprovalError, type ManualCryptoApproval } from "../manual-crypto-policy";

// Called only under the central order-payment lock. This reserves an admin's
// reference without fabricating provider verification or blockchain metadata.
export async function claimManualCryptoReference(tx: Prisma.TransactionClient, input: {
  method: string; orderId: string; approval: ManualCryptoApproval;
  usdt?: { id: string; txHash: string | null } | null;
  binance?: { id: string; submittedOrderId: string | null; canonicalTransactionId: string | null } | null;
}) {
  const { reference, reason } = input.approval;
  if (input.method === "USDT_BEP20") {
    if (!input.usdt) throw new ManualCryptoApprovalError("payment_not_found");
    if (input.usdt.txHash && input.usdt.txHash.toLowerCase() !== reference) throw new ManualCryptoApprovalError("manual_approval_reference_mismatch");
    const used = await tx.usdtBep20Attempt.findFirst({ where: { txHash: reference, orderId: { not: input.orderId } }, select: { id: true } });
    if (used) throw new ManualCryptoApprovalError("manual_approval_reference_used");
    await tx.usdtBep20Attempt.update({ where: { id: input.usdt.id }, data: { txHash: reference, failureReason: `MANUAL_APPROVAL: ${reason}` } });
    return;
  }
  if (!input.binance) throw new ManualCryptoApprovalError("payment_not_found");
  const aliases = binanceOrderIdValueAliases(reference);
  const current = input.binance;
  if (current.submittedOrderId && !aliases.includes(current.submittedOrderId) && !aliases.includes(current.canonicalTransactionId ?? "")) {
    throw new ManualCryptoApprovalError("manual_approval_reference_mismatch");
  }
  const identity = aliases.find(value => /^\d+$/.test(value)) ?? reference;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`binance_receipt_${identity}`}))`;
  const used = await tx.binanceInternalPaymentAttempt.findFirst({ where: {
    orderId: { not: input.orderId }, OR: [{ submittedOrderId: { in: aliases } }, { canonicalTransactionId: { in: aliases } }],
  }, select: { id: true } });
  if (used) throw new ManualCryptoApprovalError("manual_approval_reference_used");
  // A web receipt may already be bound under a different provider alias.
  const webReceipt = await tx.binanceWebTransaction.findFirst({ where: {
    OR: [{ providerOrderId: { in: aliases } }, { providerTransactionId: { in: aliases } }],
    binanceInternalPaymentAttemptId: { not: current.id },
  }, select: { id: true } });
  if (webReceipt) throw new ManualCryptoApprovalError("manual_approval_reference_used");
  await tx.binanceInternalPaymentAttempt.update({ where: { id: current.id }, data: {
    submittedOrderId: current.submittedOrderId ?? reference,
    canonicalTransactionId: current.canonicalTransactionId ?? identity,
    failureReason: `MANUAL_APPROVAL: ${reason}`,
  } });
}
