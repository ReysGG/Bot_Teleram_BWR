import { prisma } from "@/server/db/prisma";
import { booleanEnv } from "@/server/env";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { binanceOrderIdValueAliases } from "@/server/payment/binance-order-id";
import {
  classifyBinanceWebCandidates,
} from "@/server/payment/binance-web-policy";
import { formatUsdtMicrosForInput } from "@/server/payment/usdt-amount";

export type BinanceWebMatchResult =
  | {
      outcome: "MATCHED";
      attemptId: string;
      transactionId: string;
      orderId: string;
    }
  | {
      outcome: "UNMATCHED" | "AMBIGUOUS" | "REJECTED" | "ALREADY_CONFIRMED";
      attemptId: string;
      reason: string;
    };

export type BinanceWebMatchingSummary = {
  scanned: number;
  matched: number;
  unmatched: number;
  ambiguous: number;
  confirmed: number;
  rejected: number;
  errors: number;
  autoConfirmEnabled: boolean;
};

function safeAttemptId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("Invalid Binance attempt ID");
  }
  return normalized;
}


export async function matchBinanceWebAttempt(input: {
  attemptId: string;
  now?: Date;
}): Promise<BinanceWebMatchResult> {
  const attemptId = safeAttemptId(input.attemptId);
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`binance_web_attempt_${attemptId}`}))`;
    const attempt = await tx.binanceInternalPaymentAttempt.findUnique({
      where: { id: attemptId },
      include: {
        order: { include: { payment: true } },
        webTransaction: true,
      },
    });
    if (!attempt || attempt.verifierMode !== "WEB_SESSION") {
      return { outcome: "REJECTED", attemptId, reason: "WEB_ATTEMPT_NOT_FOUND" };
    }
    if (attempt.status === "CONFIRMED" || attempt.order.paymentStatus === "PAID") {
      return {
        outcome: "ALREADY_CONFIRMED",
        attemptId,
        reason: "ALREADY_CONFIRMED",
      };
    }
    if (["REJECTED", "EXPIRED"].includes(attempt.status)) {
      return {
        outcome: "REJECTED",
        attemptId,
        reason: attempt.failureReason ?? "ATTEMPT_TERMINAL",
      };
    }
    if (attempt.webTransaction) {
      if (attempt.status === "VERIFIED") {
        return {
          outcome: "MATCHED",
          attemptId,
          transactionId: attempt.webTransaction.id,
          orderId: attempt.orderId,
        };
      }
      return {
        outcome: "REJECTED",
        attemptId,
        reason: "INVALID_EXISTING_TRANSACTION_BINDING",
      };
    }
    if (
      attempt.status !== "VERIFYING" ||
      !attempt.submittedOrderId ||
      !attempt.submittedAt ||
      attempt.submittedAt > attempt.expiresAt ||
      attempt.verificationExpiresAt <= now ||
      attempt.order.status !== "PENDING_PAYMENT" ||
      attempt.order.paymentStatus !== "PENDING" ||
      attempt.order.payment?.status !== "PENDING" ||
      !attempt.binanceAccountFingerprintSnapshot
    ) {
      return { outcome: "REJECTED", attemptId, reason: "ATTEMPT_NOT_MATCHABLE" };
    }

    const aliases = binanceOrderIdValueAliases(attempt.submittedOrderId);
    const rows = await tx.binanceWebTransaction.findMany({
      where: {
        accountFingerprint: attempt.binanceAccountFingerprintSnapshot,
        amountMicros: attempt.expectedUsdtMicros,
        direction: "INCOME",
        providerStatus: "SUCCESS",
        currency: "USDT",
        binanceInternalPaymentAttemptId: null,
        status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS"] },
        occurredAt: {
          gte: new Date(attempt.createdAt.getTime() - 120_000),
          lte: new Date(attempt.expiresAt.getTime() + 120_000),
        },
        OR: [
          { providerTransactionId: { in: aliases } },
          { providerOrderId: { in: aliases } },
        ],
      },
      orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
      take: 3,
    });
    const classified = classifyBinanceWebCandidates(attempt, rows);
    if (classified.outcome === "UNMATCHED") {
      await tx.binanceInternalPaymentAttempt.updateMany({
        where: { id: attempt.id, status: "VERIFYING" },
        data: { lastCheckedAt: now, failureReason: null },
      });
      return { outcome: "UNMATCHED", attemptId, reason: "NO_PROVIDER_MATCH" };
    }
    if (classified.outcome === "AMBIGUOUS") {
      await tx.binanceWebTransaction.updateMany({
        where: { id: { in: rows.map((item) => item.id) }, status: { in: ["RECEIVED", "UNMATCHED"] } },
        data: { status: "AMBIGUOUS", rejectionReason: "MULTIPLE_PROVIDER_MATCHES" },
      });
      await tx.binanceInternalPaymentAttempt.updateMany({
        where: { id: attempt.id, status: "VERIFYING" },
        data: {
          lastCheckedAt: now,
          failureReason: "Order ID Binance menghasilkan data ambigu.",
        },
      });
      return {
        outcome: "AMBIGUOUS",
        attemptId,
        reason: "MULTIPLE_PROVIDER_MATCHES",
      };
    }
    if (classified.outcome !== "MATCHED") {
      throw new Error("Unexpected Binance web match classification");
    }

    const transaction = classified.transaction;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`binance_web_transaction_${transaction.accountFingerprint}_${transaction.providerTransactionId}`}))`;
    const transactionUpdated = await tx.binanceWebTransaction.updateMany({
      where: {
        id: transaction.id,
        binanceInternalPaymentAttemptId: null,
        status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS"] },
      },
      data: {
        status: "MATCHED",
        binanceInternalPaymentAttemptId: attempt.id,
        rejectionReason: null,
      },
    });
    if (transactionUpdated.count !== 1) {
      throw new Error("Binance web transaction state changed during matching");
    }
    const amount = Number(transaction.amountMicros);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Binance web amount exceeds safe invoice precision");
    }
    const attemptUpdated = await tx.binanceInternalPaymentAttempt.updateMany({
      where: { id: attempt.id, status: "VERIFYING" },
      data: {
        status: "VERIFIED",
        observedAmount: formatUsdtMicrosForInput(amount),
        observedCurrency: transaction.currency,
        observedOrderType: transaction.transactionType ?? "C2C",
        observedProviderStatus: transaction.providerStatus,
        observedPayerName: transaction.counterpartyName,
        observedReceiverBinanceId: attempt.recipientBinanceIdSnapshot,
        observedTransactionTime: transaction.occurredAt,
        lastCheckedAt: now,
        verifiedAt: now,
        failureReason: null,
      },
    });
    if (attemptUpdated.count !== 1) {
      throw new Error("Binance web attempt state changed during matching");
    }
    return {
      outcome: "MATCHED",
      attemptId,
      transactionId: transaction.id,
      orderId: attempt.orderId,
    };
  });
}

export async function processPendingBinanceWebPayments(
  limit = 25,
  now = new Date(),
): Promise<BinanceWebMatchingSummary> {
  const attempts = await prisma.binanceInternalPaymentAttempt.findMany({
    where: {
      verifierMode: "WEB_SESSION",
      status: { in: ["VERIFYING", "VERIFIED"] },
    },
    select: { id: true },
    orderBy: [{ submittedAt: "desc" }, { createdAt: "desc" }],
    take: Math.min(100, Math.max(1, Math.trunc(limit))),
  });
  const autoConfirm = booleanEnv("BINANCE_WEB_SESSION_AUTO_CONFIRM", false);
  const summary: BinanceWebMatchingSummary = {
    scanned: attempts.length,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    confirmed: 0,
    rejected: 0,
    errors: 0,
    autoConfirmEnabled: autoConfirm,
  };
  for (const attempt of attempts) {
    try {
      const result = await matchBinanceWebAttempt({ attemptId: attempt.id, now });
      if (result.outcome === "UNMATCHED") {
        summary.unmatched += 1;
      } else if (result.outcome === "AMBIGUOUS") {
        summary.ambiguous += 1;
      } else if (result.outcome === "REJECTED") {
        summary.rejected += 1;
      } else if (result.outcome === "ALREADY_CONFIRMED") {
        summary.confirmed += 1;
      }
      if (result.outcome === "MATCHED") {
        summary.matched += 1;
        if (autoConfirm) {
          await confirmOrderPayment({
            orderId: result.orderId,
            verifiedBy: `binance-web:${result.transactionId}`,
            binanceInternalAttemptId: result.attemptId,
          });
          summary.confirmed += 1;
        }
      }
    } catch {
      summary.errors += 1;
    }
  }
  return summary;
}
