import { binanceOrderIdValueAliases } from "@/server/payment/binance-order-id";
import { isCompletedIncomingUsdtTransaction } from "@/server/payment/binance-web-contract";
import { isPaymentEventWithinWindow } from "@/server/payment/window";

export type BinanceWebEvidenceTransaction = {
  id: string;
  accountFingerprint: string;
  providerTransactionId: string;
  providerOrderId: string | null;
  transactionType: string | null;
  direction: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  currency: string;
  amountMicros: bigint;
  counterpartyName: string | null;
  receiverBinanceId: string | null;
  occurredAt: Date;
  status: string;
  binanceInternalPaymentAttemptId: string | null;
};

export function binanceWebOrderIdMatches(
  submittedOrderId: string,
  transaction: Pick<
    BinanceWebEvidenceTransaction,
    "providerOrderId" | "providerTransactionId"
  >,
): boolean {
  const aliases = new Set(binanceOrderIdValueAliases(submittedOrderId));
  return aliases.has(transaction.providerTransactionId) ||
    Boolean(transaction.providerOrderId && aliases.has(transaction.providerOrderId));
}

export function binanceWebTransactionBlockReason(input: {
  transaction: BinanceWebEvidenceTransaction | null;
  attempt: {
    id: string;
    verifierMode: string;
    binanceAccountFingerprintSnapshot: string | null;
    expectedUsdtMicros: bigint;
    recipientBinanceIdSnapshot: string;
    submittedOrderId: string | null;
    submittedAt: Date | null;
    status: string;
    expiresAt: Date;
    verificationExpiresAt: Date;
    createdAt: Date;
  };
  allowConfirmed?: boolean;
  now?: Date;
}): string | null {
  const { attempt, transaction } = input;
  const now = input.now ?? new Date();
  if (attempt.verifierMode !== "WEB_SESSION") {
    return "Binance verifier mode mismatch";
  }
  if (!transaction || transaction.binanceInternalPaymentAttemptId !== attempt.id) {
    return "Binance web transaction is not bound to this invoice";
  }
  if (
    !attempt.binanceAccountFingerprintSnapshot ||
    transaction.accountFingerprint !== attempt.binanceAccountFingerprintSnapshot
  ) {
    return "Binance web account mismatch";
  }
  if (
    !transaction.receiverBinanceId ||
    transaction.receiverBinanceId !== attempt.recipientBinanceIdSnapshot
  ) {
    return "Binance web recipient mismatch";
  }
  if (!isCompletedIncomingUsdtTransaction(transaction)) {
    return "Binance web transaction is not completed incoming USDT";
  }
  if (transaction.amountMicros !== attempt.expectedUsdtMicros) {
    return "Binance web transaction amount mismatch";
  }
  if (
    !attempt.submittedOrderId ||
    !binanceWebOrderIdMatches(attempt.submittedOrderId, transaction)
  ) {
    return "Binance web Order ID mismatch";
  }
  if (!attempt.submittedAt || attempt.submittedAt > attempt.expiresAt) {
    return "Binance Order ID was not submitted inside the invoice window";
  }
  if (!isPaymentEventWithinWindow({
    postedAt: transaction.occurredAt,
    createdAt: attempt.createdAt,
    expiresAt: attempt.expiresAt,
    skewMs: 120_000,
  })) {
    return "Binance web transaction is outside the invoice window";
  }
  if (attempt.verificationExpiresAt <= now && !input.allowConfirmed) {
    return "Binance verification window has expired";
  }
  const acceptedTransactionStatuses = input.allowConfirmed
    ? ["MATCHED", "CONFIRMED"]
    : ["MATCHED"];
  if (!acceptedTransactionStatuses.includes(transaction.status)) {
    return "Binance web transaction is not awaiting confirmation";
  }
  const acceptedAttemptStatuses = input.allowConfirmed
    ? ["VERIFIED", "CONFIRMED"]
    : ["VERIFIED"];
  if (!acceptedAttemptStatuses.includes(attempt.status)) {
    return "Binance web attempt is not verified";
  }
  return null;
}

export function binanceWebTransactionEligibleForAttempt(input: {
  transaction: BinanceWebEvidenceTransaction;
  attempt: {
    id: string;
    binanceAccountFingerprintSnapshot: string | null;
    expectedUsdtMicros: bigint;
    recipientBinanceIdSnapshot: string;
    submittedOrderId: string | null;
    createdAt: Date;
    expiresAt: Date;
  };
}): boolean {
  const { transaction, attempt } = input;
  return Boolean(
    attempt.binanceAccountFingerprintSnapshot &&
    attempt.submittedOrderId &&
    transaction.accountFingerprint === attempt.binanceAccountFingerprintSnapshot &&
    transaction.receiverBinanceId === attempt.recipientBinanceIdSnapshot &&
    transaction.amountMicros === attempt.expectedUsdtMicros &&
    !transaction.binanceInternalPaymentAttemptId &&
    ["RECEIVED", "UNMATCHED", "AMBIGUOUS"].includes(transaction.status) &&
    isCompletedIncomingUsdtTransaction(transaction) &&
    binanceWebOrderIdMatches(attempt.submittedOrderId, transaction) &&
    isPaymentEventWithinWindow({
      postedAt: transaction.occurredAt,
      createdAt: attempt.createdAt,
      expiresAt: attempt.expiresAt,
      skewMs: 120_000,
    }),
  );
}

export function classifyBinanceWebCandidates(
  attempt: Parameters<typeof binanceWebTransactionEligibleForAttempt>[0]["attempt"],
  transactions: readonly BinanceWebEvidenceTransaction[],
):
  | { outcome: "MATCHED"; transaction: BinanceWebEvidenceTransaction }
  | { outcome: "UNMATCHED" | "AMBIGUOUS" } {
  const eligible = transactions.filter((transaction) =>
    binanceWebTransactionEligibleForAttempt({ transaction, attempt }),
  );
  if (eligible.length === 0) return { outcome: "UNMATCHED" };
  if (eligible.length !== 1) return { outcome: "AMBIGUOUS" };
  return { outcome: "MATCHED", transaction: eligible[0] };
}
