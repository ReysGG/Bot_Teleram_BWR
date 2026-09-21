import { prisma } from "@/server/db/prisma";
import { booleanEnv } from "@/server/env";
import { checkoutPaymentExpiryMinutes } from "@/server/payment/checkout-expiry";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { confirmWalletTopup } from "@/server/wallet/topup";
import { PAYMENT_EVENT_CLOCK_SKEW_MS } from "@/server/payment/window";
import {
  matchShopeePartnerTransaction,
  type ShopeeInvoiceMatchResult,
  type ShopeeMatchingSummary,
} from "@/server/payment/shopee-partner-matching";

let activeMatchingRun: Promise<ShopeeMatchingSummary> | null = null;

function matchingEvidenceCutoff(now: Date): Date {
  // Evidence outside this window cannot match a new five-minute invoice. It
  // remains in the ledger, but retrying it every few seconds only creates
  // avoidable transactions and pool contention.
  const retryWindowMs =
    checkoutPaymentExpiryMinutes("DANA") * 60_000 +
    PAYMENT_EVENT_CLOCK_SKEW_MS +
    60_000;
  return new Date(now.getTime() - retryWindowMs);
}

/**
 * Match normalized web-session rows and, only for an explicitly snapshotted
 * web invoice, run the same transactional confirmation path as other providers.
 */
async function processPendingShopeePartnerPaymentsOnce(
  limit = 25,
  now = new Date(),
): Promise<ShopeeMatchingSummary> {
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
  const occurredAfter = matchingEvidenceCutoff(now);
  const rows = await prisma.shopeePartnerTransaction.findMany({
    where: {
      status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS", "MATCHED"] },
      occurredAt: { gte: occurredAfter },
    },
    // Recent rows must not be starved by a growing backlog of historical
    // UNMATCHED evidence.
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: boundedLimit,
    select: {
      merchantAccountFingerprint: true,
      externalTransactionId: true,
    },
  });
  const autoConfirm = booleanEnv("SHOPEE_WEB_SESSION_AUTO_CONFIRM", false);
  const summary: ShopeeMatchingSummary = {
    scanned: rows.length,
    matched: 0,
    unmatched: 0,
    ambiguous: 0,
    confirmed: 0,
    rejected: 0,
    errors: 0,
    autoConfirmEnabled: autoConfirm,
  };

  for (const row of rows) {
    try {
      const result: ShopeeInvoiceMatchResult =
        await matchShopeePartnerTransaction({
          merchantAccountFingerprint: row.merchantAccountFingerprint,
          externalTransactionId: row.externalTransactionId,
          now,
        });
      if (result.outcome === "UNMATCHED") {
        summary.unmatched += 1;
        continue;
      }
      if (result.outcome === "AMBIGUOUS") {
        summary.ambiguous += 1;
        continue;
      }
      if (result.outcome === "REJECTED") {
        summary.rejected += 1;
        continue;
      }
      if (result.outcome === "ALREADY_CONFIRMED") {
        summary.confirmed += 1;
        continue;
      }

      if (result.outcome !== "MATCHED") continue;

      summary.matched += 1;
      if (!autoConfirm) continue;
      if (result.target.kind === "order") {
        await confirmOrderPayment({
          orderId: result.target.id,
          verifiedBy: `shopee-partner:${row.externalTransactionId}`,
          shopeePartnerTransactionId: row.externalTransactionId,
        });
      } else {
        await confirmWalletTopup({
          walletTopupId: result.target.id,
          verifiedBy: `shopee-partner:${row.externalTransactionId}`,
          shopeePartnerTransactionId: row.externalTransactionId,
        });
      }
      summary.confirmed += 1;
    } catch {
      // A matched row remains MATCHED when confirmation cannot commit. The
      // next cron run retries it without losing the immutable evidence.
      summary.errors += 1;
    }
  }
  return summary;
}

/** Share one in-flight pass when the five-second scheduler overlaps. */
export function processPendingShopeePartnerPayments(
  limit = 25,
  now = new Date(),
): Promise<ShopeeMatchingSummary> {
  if (activeMatchingRun) return activeMatchingRun;
  const run = processPendingShopeePartnerPaymentsOnce(limit, now);
  const tracked = run.finally(() => {
    if (activeMatchingRun === tracked) activeMatchingRun = null;
  });
  activeMatchingRun = tracked;
  return tracked;
}
