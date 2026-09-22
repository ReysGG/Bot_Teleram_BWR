import { createHmac } from "node:crypto";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { booleanEnv, integerEnv } from "@/server/env";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import {
  getBinanceInternalSetting,
  requireBinanceApiCredentials,
} from "@/server/payment/binance-internal-setting";
import { getUsdtRateSetting } from "@/server/payment/usdt-rate-setting";
import { parsePositiveUsdtMicros } from "@/server/payment/binance-internal-amount";
import {
  binanceOrderIdValueAliases,
  canonicalBinanceOrderIdValue,
  normalizeBinanceOrderIdValue,
} from "@/server/payment/binance-order-id";
import { matchBinanceWebAttempt } from "@/server/payment/binance-web-matching";
import { pollBinanceWebSessions } from "@/server/payment/binance-web-worker";
import { cleanError } from "@/server/utils/format";

export const BINANCE_INTERNAL_METHOD = "BINANCE_INTERNAL" as const;
export const BINANCE_PAY_HISTORY_PATH = "/sapi/v1/pay/transactions";
const SUPPORTED_ORDER_TYPES = new Set(["C2C", "PAY"]);

export class BinanceInternalError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "BinanceInternalError";
  }
}

export function normalizeBinanceOrderId(value: string) {
  try {
    return normalizeBinanceOrderIdValue(value);
  } catch {
    throw new BinanceInternalError(
      "INVALID_ORDER_ID",
      "Order ID Binance harus berisi 6-128 huruf atau angka.",
    );
  }
}

export function canonicalBinanceTransactionId(value: string) {
  return canonicalBinanceOrderIdValue(normalizeBinanceOrderId(value));
}

// Binance receipts show a numeric Order ID while Pay history can return M_P_<ID>.
// Keep both as strings: receipt IDs can exceed JavaScript's safe integer range.
export function binanceOrderIdAliases(value: string): string[] {
  return binanceOrderIdValueAliases(normalizeBinanceOrderId(value));
}

export function signBinanceQuery(query: string, apiSecret: string) {
  return createHmac("sha256", apiSecret).update(query).digest("hex");
}

export type BinancePayHistoryTransaction = {
  orderType?: unknown;
  transactionId?: unknown;
  orderId?: unknown;
  transactionTime?: unknown;
  amount?: unknown;
  currency?: unknown;
  walletType?: unknown;
  walletTypes?: unknown;
  status?: unknown;
  payerInfo?: { name?: unknown } | null;
  receiverInfo?: { binanceId?: unknown; name?: unknown } | null;
};

export type BinancePayApiClient = {
  listTransactions(input: {
    startTime: number;
    endTime: number;
    limit?: number;
  }): Promise<BinancePayHistoryTransaction[]>;
};

export function createBinancePayApiClient(input?: {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): BinancePayApiClient {
  const credentials =
    input?.apiKey && input.apiSecret && input.baseUrl
      ? {
          apiKey: input.apiKey,
          apiSecret: input.apiSecret,
          baseUrl: input.baseUrl,
        }
      : requireBinanceApiCredentials();
  const fetchImpl = input?.fetchImpl ?? fetch;
  const now = input?.now ?? Date.now;
  return {
    async listTransactions(request) {
      const limit = Math.min(100, Math.max(1, Math.floor(request.limit ?? 100)));
      const params = new URLSearchParams({
        startTime: String(Math.floor(request.startTime)),
        endTime: String(Math.floor(request.endTime)),
        limit: String(limit),
        recvWindow: String(integerEnv("BINANCE_API_RECV_WINDOW_MS", 5_000)),
        timestamp: String(now()),
      });
      params.set(
        "signature",
        signBinanceQuery(params.toString(), credentials.apiSecret),
      );
      const baseUrl = new URL(credentials.baseUrl);
      const url = new URL(BINANCE_PAY_HISTORY_PATH, baseUrl);
      url.search = params.toString();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        integerEnv("BINANCE_API_TIMEOUT_MS", 12_000),
      );
      try {
        const response = await fetchImpl(url, {
          method: "GET",
          headers: { "X-MBX-APIKEY": credentials.apiKey },
          signal: controller.signal,
          cache: "no-store",
        });
        const text = await response.text();
        if (text.length > 1_000_000) throw new Error("Binance response too large");
        if (!response.ok) throw new Error(`Binance API HTTP ${response.status}`);
        const payload: unknown = JSON.parse(text);
        if (!payload || typeof payload !== "object") throw new Error("Invalid Binance response");
        // A HTTP 200 can still carry a failed Binance business response.
        if (!Array.isArray(payload) &&
          (!("success" in payload) || payload.success !== true ||
            !("code" in payload) || payload.code !== "000000")) {
          throw new Error("Binance Pay history unavailable");
        }
        const transactions = Array.isArray(payload)
          ? payload
          : "data" in payload ? payload.data : undefined;
        if (!Array.isArray(transactions) || transactions.some(
          (transaction) => !transaction || typeof transaction !== "object" ||
            Array.isArray(transaction) || typeof transaction.transactionId !== "string",
        )) throw new Error("Invalid Binance response");
        return transactions as BinancePayHistoryTransaction[];
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizedBinanceId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const text = String(value).trim();
  return /^\d{5,32}$/.test(text) ? text : "";
}

function transactionTime(value: unknown) {
  const milliseconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  const date = new Date(milliseconds);
  return Number.isFinite(milliseconds) && Number.isFinite(date.getTime())
    ? date
    : null;
}

function safeName(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 200) || null : null;
}

function safeWalletTypes(transaction: BinancePayHistoryTransaction) {
  const values = Array.isArray(transaction.walletTypes)
    ? transaction.walletTypes
    : transaction.walletType === undefined
      ? []
      : [transaction.walletType];
  return values
    .filter((value) => typeof value === "number" || typeof value === "string")
    .slice(0, 20)
    .map(String);
}

export async function getBinanceInternalCheckoutConfig() {
  const [setting, rate] = await Promise.all([
    getBinanceInternalSetting(),
    getUsdtRateSetting(),
  ]);
  return {
    enabled:
      setting.enabled && Boolean(setting.recipientId) && setting.verifierReady,
    recipientId: setting.recipientId,
    recipientSource: setting.recipientSource,
    apiConfigured: setting.api.configured,
    apiSource: setting.api.source,
    webSessionReady: setting.web.ready,
    webSessionId: setting.web.sessionId,
    webSessionName: setting.web.sessionName,
    verifierMode: setting.verifierMode,
    rate: rate.rate,
    rateSource: rate.source,
  };
}

export async function createBinanceInternalOrder(input: {
  chatId: string;
  buyerEmail?: string | null;
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
  productId: string;
  idempotencyKey: string;
  quantity?: number;
}) {
  return createDigitalOrder({ ...input, paymentMethod: BINANCE_INTERNAL_METHOD });
}

export async function getBinanceInternalAttemptForOrder(input: {
  orderId: string;
  chatId?: string;
}) {
  const attempt = await prisma.binanceInternalPaymentAttempt.findFirst({
    where: {
      orderId: input.orderId,
      ...(input.chatId ? { order: { chatId: input.chatId } } : {}),
    },
    include: {
      order: {
        include: { payment: true, items: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  if (!attempt) {
    throw new BinanceInternalError(
      "ATTEMPT_NOT_FOUND",
      "Instruksi Binance Pay tidak ditemukan.",
    );
  }
  return attempt;
}

async function rejectAttempt(id: string, reason: string) {
  await prisma.binanceInternalPaymentAttempt.updateMany({
    where: { id, status: "VERIFYING" },
    data: {
      status: "REJECTED",
      lastCheckedAt: new Date(),
      failureReason: reason.slice(0, 500),
    },
  });
  return { outcome: "REJECTED" as const, reason };
}

export async function verifyBinanceInternalAttempt(input: {
  attemptId: string;
  apiClient?: BinancePayApiClient;
  transactions?: BinancePayHistoryTransaction[];
}) {
  const attempt = await prisma.binanceInternalPaymentAttempt.findUnique({
    where: { id: input.attemptId },
    include: { order: { include: { payment: true } } },
  });
  if (!attempt?.submittedOrderId || !attempt.canonicalTransactionId) {
    throw new BinanceInternalError(
      "ATTEMPT_NOT_FOUND",
      "Order ID Binance belum dikirim.",
    );
  }
  if (attempt.status === "CONFIRMED") return { outcome: "CONFIRMED" as const };
  if (attempt.status === "REJECTED" || attempt.status === "EXPIRED") {
    return {
      outcome: "REJECTED" as const,
      reason: attempt.failureReason ?? "Transaksi tidak dapat diverifikasi.",
    };
  }
  if (attempt.verifierMode === "WEB_SESSION") {
    if (!attempt.binanceWebSessionIdSnapshot) {
      return { outcome: "PENDING_PROVIDER" as const };
    }
    if (attempt.status !== "VERIFIED") {
      await pollBinanceWebSessions({
        sessionId: attempt.binanceWebSessionIdSnapshot,
        maxPages: 2,
      });
    }
    const matched = await matchBinanceWebAttempt({ attemptId: attempt.id });
    if (matched.outcome === "MATCHED") {
      if (!booleanEnv("BINANCE_WEB_SESSION_AUTO_CONFIRM", false)) {
        return { outcome: "MATCHED" as const };
      }
      await confirmOrderPayment({
        orderId: matched.orderId,
        verifiedBy: `binance-web:${matched.transactionId}`,
        binanceInternalAttemptId: matched.attemptId,
      });
      return { outcome: "CONFIRMED" as const };
    }
    if (matched.outcome === "ALREADY_CONFIRMED") {
      return { outcome: "CONFIRMED" as const };
    }
    return matched.outcome === "REJECTED"
      ? { outcome: "REJECTED" as const, reason: matched.reason }
      : { outcome: "PENDING_PROVIDER" as const };
  }
  if (attempt.status === "VERIFIED") {
    await confirmOrderPayment({
      orderId: attempt.orderId,
      verifiedBy: `binance-internal:${attempt.canonicalTransactionId}`,
      binanceInternalAttemptId: attempt.id,
    });
    return { outcome: "CONFIRMED" as const };
  }
  const now = new Date();
  if (attempt.verificationExpiresAt <= now) {
    return rejectAttempt(attempt.id, "Waktu verifikasi pembayaran telah berakhir.");
  }
  if (
    !input.transactions &&
    attempt.lastCheckedAt &&
    attempt.lastCheckedAt > new Date(now.getTime() - 30_000)
  ) {
    return { outcome: "PENDING_PROVIDER" as const };
  }

  let transactions = input.transactions;
  if (!transactions) {
    try {
      transactions = await (input.apiClient ?? createBinancePayApiClient())
        .listTransactions({
          startTime: attempt.createdAt.getTime() - 120_000,
          endTime: Math.min(now.getTime(), attempt.verificationExpiresAt.getTime()),
          limit: 100,
        });
    } catch {
      await prisma.binanceInternalPaymentAttempt.updateMany({
        where: { id: attempt.id, status: "VERIFYING" },
        data: {
          lastCheckedAt: now,
          failureReason: "Binance API sementara tidak dapat memverifikasi transaksi.",
        },
      });
      return { outcome: "PENDING_PROVIDER" as const };
    }
  }
  const transactionIds = new Set([
    ...binanceOrderIdAliases(attempt.submittedOrderId),
    attempt.canonicalTransactionId,
  ]);
  const matches = transactions.filter(
    (transaction) => typeof transaction.transactionId === "string" &&
      (transactionIds.has(transaction.transactionId) ||
        (typeof transaction.orderId === "string" && transactionIds.has(transaction.orderId))),
  );
  if (matches.length === 0) {
    await prisma.binanceInternalPaymentAttempt.updateMany({
      where: { id: attempt.id, status: "VERIFYING" },
      data: { lastCheckedAt: now, failureReason: null },
    });
    return { outcome: "PENDING_PROVIDER" as const };
  }
  if (matches.length !== 1) {
    return rejectAttempt(attempt.id, "Order ID Binance menghasilkan data ambigu.");
  }
  const transaction = matches[0];
  const orderType = normalizedText(transaction.orderType).toUpperCase();
  const currency = normalizedText(transaction.currency).toUpperCase();
  const amountMicros = parsePositiveUsdtMicros(transaction.amount);
  const receiverBinanceId = normalizedBinanceId(
    transaction.receiverInfo?.binanceId,
  );
  const paidAt = transactionTime(transaction.transactionTime);
  if (
    !SUPPORTED_ORDER_TYPES.has(orderType) ||
    currency !== "USDT" ||
    amountMicros !== attempt.expectedUsdtMicros ||
    receiverBinanceId !== attempt.recipientBinanceIdSnapshot ||
    !paidAt ||
    paidAt < new Date(attempt.createdAt.getTime() - 120_000) ||
    paidAt > attempt.expiresAt
  ) {
    return rejectAttempt(
      attempt.id,
      "Detail transaksi Binance tidak sesuai dengan invoice.",
    );
  }

  // Binance's app Order ID and provider transactionId may be different.
  // Match either, but atomically bind the actual transaction so both identifiers
  // cannot be used to pay separate invoices (including legacy confirmed claims).
  const providerTransactionId = canonicalBinanceTransactionId(String(transaction.transactionId));
  const providerAliases = binanceOrderIdAliases(String(transaction.transactionId));
  const evidenceAliases = new Set(providerAliases);
  if (typeof transaction.orderId === "string" && /^[A-Za-z0-9_-]{6,128}$/.test(transaction.orderId)) {
    binanceOrderIdAliases(transaction.orderId).forEach(id => evidenceAliases.add(id));
  }
  const receiptIdentity = providerAliases.find(id => /^\d+$/.test(id)) ?? providerTransactionId;
  const verified = await prisma.$transaction(async tx => {
    await lockOrderPaymentTransition(tx, attempt.orderId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`binance_receipt_${receiptIdentity}`}))`;
    const claimed = await tx.binanceInternalPaymentAttempt.findFirst({ where: {
      id: { not: attempt.id },
      OR: [{ canonicalTransactionId: { in: [...evidenceAliases] } }, { submittedOrderId: { in: [...evidenceAliases] } }],
    }, select: { id: true } });
    if (claimed) return { count: 0, duplicate: true };
    return tx.binanceInternalPaymentAttempt.updateMany({
    where: {
      id: attempt.id,
      canonicalTransactionId: attempt.canonicalTransactionId,
      status: "VERIFYING",
    },
    data: {
      status: "VERIFIED",
      canonicalTransactionId: providerTransactionId,
      observedAmount: String(transaction.amount),
      observedCurrency: currency,
      observedOrderType: orderType,
      observedProviderStatus: null,
      observedWalletTypes: safeWalletTypes(transaction),
      observedPayerName: safeName(transaction.payerInfo?.name),
      observedReceiverBinanceId: receiverBinanceId,
      observedReceiverName: safeName(transaction.receiverInfo?.name),
      observedTransactionTime: paidAt,
      lastCheckedAt: now,
      verifiedAt: now,
      failureReason: null,
    },
  });
  });
  if ("duplicate" in verified && verified.duplicate) {
    return rejectAttempt(attempt.id, "Transaksi Binance sudah diklaim oleh invoice lain.");
  }
  if (verified.count === 0) {
    const current = await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
    });
    if (current.status === "CONFIRMED") return { outcome: "CONFIRMED" as const };
    if (current.status !== "VERIFIED") return { outcome: "PENDING_PROVIDER" as const };
  }
  await confirmOrderPayment({
    orderId: attempt.orderId,
    verifiedBy: `binance-internal:${providerTransactionId}`,
    binanceInternalAttemptId: attempt.id,
  });
  return { outcome: "CONFIRMED" as const };
}

export async function submitBinanceInternalOrderId(input: {
  orderId: string;
  chatId: string;
  submittedOrderId: string;
  apiClient?: BinancePayApiClient;
}) {
  const submittedOrderId = normalizeBinanceOrderId(input.submittedOrderId);
  const canonicalTransactionId = canonicalBinanceTransactionId(submittedOrderId);
  const aliases = binanceOrderIdAliases(submittedOrderId);
  const receiptIdentity = aliases.find((alias) => /^\d+$/.test(alias)) ?? canonicalTransactionId;
  let attemptId: string;
  try {
    attemptId = await prisma.$transaction(async (tx) => {
      await lockOrderPaymentTransition(tx, input.orderId);
      // Serialize claims across invoices even when numeric and prefixed aliases differ.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`binance_receipt_${receiptIdentity}`}))`;
      const attempt = await tx.binanceInternalPaymentAttempt.findFirst({
        where: { orderId: input.orderId, order: { chatId: input.chatId } },
        include: { order: { include: { payment: true } } },
      });
      if (!attempt?.order.payment) {
        throw new BinanceInternalError("ORDER_NOT_FOUND", "Order tidak ditemukan.");
      }
      if ((attempt.canonicalTransactionId && aliases.includes(attempt.canonicalTransactionId)) ||
          (attempt.submittedOrderId && aliases.includes(attempt.submittedOrderId))) {
        return attempt.id;
      }
      if (attempt.status !== "AWAITING_ORDER_ID") {
        throw new BinanceInternalError(
          "ORDER_ID_ALREADY_SUBMITTED",
          "Order ID untuk invoice ini sudah dikirim.",
        );
      }
      const now = new Date();
      if (
        attempt.expiresAt <= now ||
        attempt.order.status !== "PENDING_PAYMENT" ||
        attempt.order.paymentStatus !== "PENDING" ||
        attempt.order.payment.status !== "PENDING"
      ) {
        throw new BinanceInternalError(
          "ATTEMPT_EXPIRED",
          "Batas waktu pengiriman Order ID telah berakhir.",
        );
      }
      if (
        await tx.binanceInternalPaymentAttempt.findFirst({
          where: {
            OR: [
              { canonicalTransactionId: { in: aliases } },
              { submittedOrderId: { in: aliases } },
            ],
          },
        })
      ) {
        throw new BinanceInternalError(
          "ORDER_ID_ALREADY_USED",
          "Order ID Binance tersebut sudah digunakan.",
        );
      }
      await tx.binanceInternalPaymentAttempt.update({
        where: { id: attempt.id },
        data: {
          status: "VERIFYING",
          submittedOrderId,
          canonicalTransactionId,
          submittedAt: now,
          failureReason: null,
        },
      });
      return attempt.id;
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new BinanceInternalError(
        "ORDER_ID_ALREADY_USED",
        "Order ID Binance tersebut sudah digunakan.",
      );
    }
    throw error;
  }
  const verification = await verifyBinanceInternalAttempt({
    attemptId,
    apiClient: input.apiClient,
  });
  return {
    attempt: await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({
      where: { id: attemptId },
    }),
    verification,
  };
}

export async function refreshBinanceInternalVerification(input: {
  orderId: string;
  chatId: string;
  apiClient?: BinancePayApiClient;
}) {
  const attempt = await prisma.binanceInternalPaymentAttempt.findFirst({
    where: {
      orderId: input.orderId,
      order: { chatId: input.chatId },
      submittedOrderId: { not: null },
    },
    select: { id: true },
  });
  if (!attempt) {
    throw new BinanceInternalError(
      "ATTEMPT_NOT_FOUND",
      "Order ID Binance belum dikirim.",
    );
  }
  return verifyBinanceInternalAttempt({
    attemptId: attempt.id,
    apiClient: input.apiClient,
  });
}

export async function processPendingBinanceInternalAttempts(
  limit = 25,
  apiClient?: BinancePayApiClient,
) {
  const attempts = await prisma.binanceInternalPaymentAttempt.findMany({
    where: {
      verifierMode: "OFFICIAL_API",
      status: { in: ["VERIFYING", "VERIFIED"] },
    },
    select: { id: true, status: true, createdAt: true, verificationExpiresAt: true },
    orderBy: [{ lastCheckedAt: "asc" }, { submittedAt: "asc" }],
    take: Math.min(100, Math.max(1, Math.floor(limit))),
  });
  const verifying = attempts.filter((attempt) => attempt.status === "VERIFYING");
  let transactions: BinancePayHistoryTransaction[] | undefined;
  if (verifying.length > 0) {
    try {
      transactions = await (apiClient ?? createBinancePayApiClient()).listTransactions({
        startTime:
          Math.min(...verifying.map((attempt) => attempt.createdAt.getTime())) -
          120_000,
        endTime: Math.min(
          Date.now(),
          Math.max(
            ...verifying.map((attempt) =>
              attempt.verificationExpiresAt.getTime(),
            ),
          ),
        ),
        limit: 100,
      });
    } catch {
      await prisma.binanceInternalPaymentAttempt.updateMany({
        where: { id: { in: verifying.map((attempt) => attempt.id) }, status: "VERIFYING" },
        data: {
          lastCheckedAt: new Date(),
          failureReason: "Binance API sementara tidak dapat memverifikasi transaksi.",
        },
      });
      transactions = undefined;
    }
  }
  const results = [];
  for (const attempt of attempts) {
    if (attempt.status === "VERIFYING" && !transactions) continue;
    try {
      results.push(
        await verifyBinanceInternalAttempt({
          attemptId: attempt.id,
          transactions:
            attempt.status === "VERIFYING" ? transactions : undefined,
        }),
      );
    } catch (error) {
      // A VERIFIED attempt remains retryable when fulfillment confirmation fails.
      console.warn("[Binance internal payment worker]", {
        attemptId: attempt.id,
        error: cleanError(error),
      });
    }
  }
  return { checked: attempts.length, results };
}

export async function listBinanceInternalAttempts(input: {
  status?:
    | "AWAITING_ORDER_ID"
    | "VERIFYING"
    | "VERIFIED"
    | "CONFIRMED"
    | "REJECTED"
    | "EXPIRED";
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 20)));
  const search = input.search?.trim().slice(0, 128);
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
           OR: [
             { submittedOrderId: { contains: search, mode: "insensitive" as const } },
             { webTransaction: { providerOrderId: { contains: search, mode: "insensitive" as const } } },
             { webTransaction: { providerTransactionId: { contains: search, mode: "insensitive" as const } } },
             { order: { invoiceNumber: { contains: search, mode: "insensitive" as const } } },
            { order: { chatId: { contains: search, mode: "insensitive" as const } } },
            { order: { buyerUsername: { contains: search, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.binanceInternalPaymentAttempt.findMany({
      where,
       include: {
         order: { include: { payment: true, items: { orderBy: { createdAt: "asc" } } } },
         binanceWebSession: { select: { name: true, cookieFingerprint: true } },
         webTransaction: true,
       },
      orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.binanceInternalPaymentAttempt.count({ where }),
  ]);
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
