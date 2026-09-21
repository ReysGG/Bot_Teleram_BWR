import { prisma } from "@/server/db/prisma";
import {
  PAYMENT_EVENT_CLOCK_SKEW_MS,
  isPaymentEventWithinWindow,
} from "@/server/payment/window";
import {
  SHOPEE_COMPLETED_STATUS,
  SHOPEE_INCOMING_TRANSACTION_TYPE,
  SHOPEE_TRANSACTION_SERVICES,
} from "@/server/payment/shopee-partner-contract";

export const SHOPEE_PARTNER_PROVIDER_KEY = "SHOPEE_PARTNER" as const;
export const SHOPEE_WEB_SESSION_EVIDENCE_MODE = "WEB_SESSION" as const;
export const SHOPEE_COMPLETED_STATUS_CODE = SHOPEE_COMPLETED_STATUS;

type MatchableTransaction = {
  id?: string;
  externalTransactionId: string;
  merchantAccountFingerprint: string;
  service: number;
  transactionType: number;
  statusCode: number;
  amount: number;
  occurredAt: Date;
  status?: string;
  qrisInvoiceAttemptId?: string | null;
};

export type ShopeeInvoiceMatchCandidate = {
  id: string;
  evidenceMode: string;
  providerKeySnapshot: string;
  shopeeAccountFingerprintSnapshot: string | null;
  amount: number;
  createdAt: Date;
  expiresAt: Date;
  status: string;
  matchedEventId?: string | null;
  order?: {
    id: string;
    status: string;
    paymentStatus: string;
  } | null;
  walletTopup?: {
    id: string;
    status: string;
  } | null;
};

export type ShopeeInvoiceMatchResult =
  | {
      outcome: "MATCHED";
      transactionId: string;
      invoiceAttemptId: string;
      target: { kind: "order" | "wallet_topup"; id: string };
    }
  | { outcome: "UNMATCHED" | "AMBIGUOUS" | "ALREADY_CONFIRMED" | "REJECTED"; transactionId: string; reason: string };

export type ShopeeMatchingSummary = {
  scanned: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  confirmed: number;
  rejected: number;
  errors: number;
  autoConfirmEnabled?: boolean;
};

function safeId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    throw new Error("Invalid Shopee transaction identifier");
  }
  return normalized;
}

function candidateIsPending(candidate: ShopeeInvoiceMatchCandidate): boolean {
  if (candidate.status !== "AWAITING_PAYMENT" || candidate.matchedEventId) return false;
  if (candidate.order) {
    return candidate.order.status === "PENDING_PAYMENT" &&
      candidate.order.paymentStatus === "PENDING";
  }
  if (candidate.walletTopup) return candidate.walletTopup.status === "PENDING";
  return false;
}

/**
 * Applies the same immutable account, amount, provider, and time-window rules
 * to every candidate before a transaction can claim an invoice.
 */
export function eligibleShopeeInvoiceCandidates(
  transaction: MatchableTransaction,
  candidates: readonly ShopeeInvoiceMatchCandidate[],
  now = new Date(),
): ShopeeInvoiceMatchCandidate[] {
  return candidates.filter((candidate) =>
    transaction.statusCode === SHOPEE_COMPLETED_STATUS_CODE &&
    transaction.transactionType === SHOPEE_INCOMING_TRANSACTION_TYPE &&
    (SHOPEE_TRANSACTION_SERVICES as readonly number[]).includes(transaction.service) &&
    candidate.evidenceMode === SHOPEE_WEB_SESSION_EVIDENCE_MODE &&
    candidate.providerKeySnapshot === SHOPEE_PARTNER_PROVIDER_KEY &&
    candidate.shopeeAccountFingerprintSnapshot === transaction.merchantAccountFingerprint &&
    candidate.amount === transaction.amount &&
    candidate.expiresAt.getTime() > now.getTime() &&
    candidateIsPending(candidate) &&
    isPaymentEventWithinWindow({
      postedAt: transaction.occurredAt,
      createdAt: candidate.createdAt,
      expiresAt: candidate.expiresAt,
    }),
  );
}

export function classifyShopeeInvoiceMatch(
  transaction: MatchableTransaction,
  candidates: readonly ShopeeInvoiceMatchCandidate[],
  now = new Date(),
): { outcome: "MATCHED"; candidate: ShopeeInvoiceMatchCandidate } | {
  outcome: "UNMATCHED" | "AMBIGUOUS";
  reason: string;
} {
  const eligible = eligibleShopeeInvoiceCandidates(transaction, candidates, now);
  if (eligible.length === 0) {
    return { outcome: "UNMATCHED", reason: "NO_ACTIVE_INVOICE_MATCH" };
  }
  if (eligible.length !== 1) {
    return { outcome: "AMBIGUOUS", reason: "MULTIPLE_ACTIVE_INVOICE_MATCHES" };
  }
  return { outcome: "MATCHED", candidate: eligible[0] };
}

export function shopeePartnerTransactionBlockReason(input: {
  transaction: MatchableTransaction;
  invoiceAttempt: {
    id: string;
    evidenceMode: string;
    providerKeySnapshot: string;
    shopeeAccountFingerprintSnapshot: string | null;
    amount: number;
    createdAt: Date;
    expiresAt: Date;
    status: string;
  };
  allowConfirmed?: boolean;
  now?: Date;
}): string | null {
  const { transaction, invoiceAttempt } = input;
  if (invoiceAttempt.evidenceMode !== SHOPEE_WEB_SESSION_EVIDENCE_MODE) {
    return "Shopee transaction evidence mode mismatch";
  }
  if (invoiceAttempt.providerKeySnapshot !== SHOPEE_PARTNER_PROVIDER_KEY) {
    return "Shopee transaction provider mismatch";
  }
  if (!invoiceAttempt.shopeeAccountFingerprintSnapshot ||
      invoiceAttempt.shopeeAccountFingerprintSnapshot !== transaction.merchantAccountFingerprint) {
    return "Shopee merchant account mismatch";
  }
  if (transaction.statusCode !== SHOPEE_COMPLETED_STATUS_CODE ||
      transaction.transactionType !== SHOPEE_INCOMING_TRANSACTION_TYPE ||
      !(SHOPEE_TRANSACTION_SERVICES as readonly number[]).includes(transaction.service)) {
    return "Shopee transaction is not a completed incoming payment";
  }
  if (transaction.amount !== invoiceAttempt.amount) {
    return "Shopee transaction amount mismatch";
  }
  if (transaction.qrisInvoiceAttemptId !== invoiceAttempt.id) {
    return "Shopee transaction is not bound to this invoice";
  }
  const acceptedStatuses = input.allowConfirmed ? ["MATCHED", "CONFIRMED"] : ["MATCHED"];
  if (!transaction.status || !acceptedStatuses.includes(transaction.status)) {
    return "Shopee transaction is not awaiting confirmation";
  }
  if (invoiceAttempt.status !== "MATCHED" &&
      !(input.allowConfirmed && invoiceAttempt.status === "CONFIRMED")) {
    return "Shopee invoice is not matched";
  }
  if (!isPaymentEventWithinWindow({
    postedAt: transaction.occurredAt,
    createdAt: invoiceAttempt.createdAt,
    expiresAt: invoiceAttempt.expiresAt,
  })) {
    return "Shopee transaction is outside the invoice window";
  }
  if (!input.allowConfirmed && invoiceAttempt.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    return "Shopee invoice has expired";
  }
  return null;
}

type MatchTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

type PersistedTransaction = MatchableTransaction & {
  id: string;
  status: string;
  qrisInvoiceAttemptId: string | null;
  qrisInvoiceAttempt?: {
    orderId: string | null;
    walletTopupId: string | null;
    status: string;
    expiresAt: Date;
  } | null;
};

function candidateTarget(candidate: ShopeeInvoiceMatchCandidate): {
  kind: "order" | "wallet_topup";
  id: string;
} {
  if (candidate.order && !candidate.walletTopup) {
    return { kind: "order", id: candidate.order.id };
  }
  if (candidate.walletTopup && !candidate.order) {
    return { kind: "wallet_topup", id: candidate.walletTopup.id };
  }
  throw new Error("Shopee invoice target is invalid");
}

function persistedTarget(transaction: PersistedTransaction): {
  kind: "order" | "wallet_topup";
  id: string;
} {
  const attempt = transaction.qrisInvoiceAttempt;
  if (attempt?.orderId && !attempt.walletTopupId) {
    return { kind: "order", id: attempt.orderId };
  }
  if (attempt?.walletTopupId && !attempt.orderId) {
    return { kind: "wallet_topup", id: attempt.walletTopupId };
  }
  throw new Error("Matched Shopee invoice target is invalid");
}

async function loadCandidates(
  tx: MatchTransactionClient,
  transaction: PersistedTransaction,
  now: Date,
  invoiceAttemptId?: string,
): Promise<ShopeeInvoiceMatchCandidate[]> {
  const latestCreatedAt = new Date(
    transaction.occurredAt.getTime() + PAYMENT_EVENT_CLOCK_SKEW_MS,
  );
  const earliestExpiry = new Date(
    transaction.occurredAt.getTime() - PAYMENT_EVENT_CLOCK_SKEW_MS,
  );
  const candidates = await tx.qrisInvoiceAttempt.findMany({
    where: {
      evidenceMode: SHOPEE_WEB_SESSION_EVIDENCE_MODE,
      providerKeySnapshot: SHOPEE_PARTNER_PROVIDER_KEY,
      shopeeAccountFingerprintSnapshot: transaction.merchantAccountFingerprint,
      amount: transaction.amount,
      status: "AWAITING_PAYMENT",
      matchedEventId: null,
      createdAt: { lte: latestCreatedAt },
      expiresAt: { gte: earliestExpiry, gt: now },
      ...(invoiceAttemptId
        ? { id: invoiceAttemptId }
        : {
            OR: [
              {
                order: {
                  is: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
                },
              },
              {
                walletTopup: {
                  is: { status: "PENDING" },
                },
              },
            ],
          }),
    },
    select: {
      id: true,
      evidenceMode: true,
      providerKeySnapshot: true,
      shopeeAccountFingerprintSnapshot: true,
      amount: true,
      createdAt: true,
      expiresAt: true,
      status: true,
      matchedEventId: true,
      order: { select: { id: true, status: true, paymentStatus: true } },
      walletTopup: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 2,
  });
  return candidates;
}

export async function matchShopeePartnerTransaction(input: {
  merchantAccountFingerprint: string;
  externalTransactionId: string;
  now?: Date;
  invoiceAttemptId?: string;
}): Promise<ShopeeInvoiceMatchResult> {
  const accountFingerprint = input.merchantAccountFingerprint.trim();
  const externalTransactionId = safeId(input.externalTransactionId);
  if (!/^[a-f0-9]{64}$/.test(accountFingerprint)) {
    throw new Error("Invalid Shopee merchant account fingerprint");
  }
  const now = input.now ?? new Date();

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee_match_${accountFingerprint}_${externalTransactionId}`}))`;
    const transaction = await tx.shopeePartnerTransaction.findFirst({
      where: {
        merchantAccountFingerprint: accountFingerprint,
        externalTransactionId,
      },
      select: {
        id: true,
        externalTransactionId: true,
        merchantAccountFingerprint: true,
        service: true,
        transactionType: true,
        statusCode: true,
        amount: true,
        occurredAt: true,
        status: true,
        qrisInvoiceAttemptId: true,
        qrisInvoiceAttempt: {
          select: {
            orderId: true,
            walletTopupId: true,
            status: true,
            expiresAt: true,
          },
        },
      },
    });
    if (!transaction) {
      throw new Error("Shopee transaction not found");
    }
    if (transaction.status === "CONFIRMED") {
      return {
        outcome: "ALREADY_CONFIRMED",
        transactionId: transaction.id,
        reason: "ALREADY_CONFIRMED",
      };
    }
    if (transaction.status === "REJECTED") {
      return {
        outcome: "REJECTED",
        transactionId: transaction.id,
        reason: transaction.status,
      };
    }
    if (transaction.qrisInvoiceAttemptId) {
      const attempt = transaction.qrisInvoiceAttempt;
      if (!attempt) {
        await tx.shopeePartnerTransaction.updateMany({
          where: {
            id: transaction.id,
            qrisInvoiceAttemptId: transaction.qrisInvoiceAttemptId,
            status: { in: ["RECEIVED", "MATCHED", "UNMATCHED", "AMBIGUOUS"] },
          },
          data: { status: "REJECTED", rejectionReason: "INVOICE_BINDING_MISSING" },
        });
        return {
          outcome: "REJECTED",
          transactionId: transaction.id,
          reason: "INVOICE_BINDING_MISSING",
        };
      }
      if (attempt.status === "CONFIRMED") {
        await tx.shopeePartnerTransaction.updateMany({
          where: {
            id: transaction.id,
            qrisInvoiceAttemptId: transaction.qrisInvoiceAttemptId,
            status: "MATCHED",
          },
          data: { status: "CONFIRMED", confirmedAt: now },
        });
        return {
          outcome: "ALREADY_CONFIRMED",
          transactionId: transaction.id,
          reason: "INVOICE_ALREADY_CONFIRMED",
        };
      }
      if (attempt.status === "EXPIRED" || attempt.status === "CANCELLED" || attempt.expiresAt.getTime() <= now.getTime()) {
        await tx.shopeePartnerTransaction.updateMany({
          where: {
            id: transaction.id,
            qrisInvoiceAttemptId: transaction.qrisInvoiceAttemptId,
            status: { in: ["RECEIVED", "MATCHED", "UNMATCHED", "AMBIGUOUS"] },
          },
          data: { status: "REJECTED", rejectionReason: "INVOICE_TERMINAL" },
        });
        return {
          outcome: "REJECTED",
          transactionId: transaction.id,
          reason: "INVOICE_TERMINAL",
        };
      }
      return {
        outcome: "MATCHED",
        transactionId: transaction.id,
        invoiceAttemptId: transaction.qrisInvoiceAttemptId,
        target: persistedTarget(transaction),
      };
    }

    const candidates = await loadCandidates(tx, transaction, now, input.invoiceAttemptId);
    const classified = classifyShopeeInvoiceMatch(transaction, candidates, now);
    if (classified.outcome !== "MATCHED") {
      await tx.shopeePartnerTransaction.updateMany({
        where: {
          id: transaction.id,
          qrisInvoiceAttemptId: null,
          status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS"] },
        },
        data: {
          status: classified.outcome,
          rejectionReason: classified.reason,
        },
      });
      return {
        outcome: classified.outcome,
        transactionId: transaction.id,
        reason: classified.reason,
      };
    }

    // Lock the invoice identity as well as the transaction identity. The
    // unique nullable relation then makes concurrent claim attempts fail closed.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`shopee_invoice_match_${classified.candidate.id}`}))`;
    const attemptUpdated = await tx.qrisInvoiceAttempt.updateMany({
      where: {
        id: classified.candidate.id,
        evidenceMode: SHOPEE_WEB_SESSION_EVIDENCE_MODE,
        status: "AWAITING_PAYMENT",
        matchedEventId: null,
      },
      // matchedAt is paired with matchedEventId by the original QRIS bridge
      // constraint. Web evidence is recorded by the bound Shopee transaction.
      data: { status: "MATCHED" },
    });
    if (attemptUpdated.count !== 1) {
      throw new Error("Shopee invoice state changed during matching");
    }
    const transactionUpdated = await tx.shopeePartnerTransaction.updateMany({
      where: {
        id: transaction.id,
        qrisInvoiceAttemptId: null,
        status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS"] },
      },
      data: {
        status: "MATCHED",
        qrisInvoiceAttemptId: classified.candidate.id,
        rejectionReason: null,
      },
    });
    if (transactionUpdated.count !== 1) {
      throw new Error("Shopee transaction state changed during matching");
    }
    return {
      outcome: "MATCHED",
      transactionId: transaction.id,
      invoiceAttemptId: classified.candidate.id,
      target: candidateTarget(classified.candidate),
    };
  });
}
