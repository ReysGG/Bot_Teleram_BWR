import { describe, expect, it } from "vitest";
import {
  binanceWebTransactionBlockReason,
  binanceWebTransactionEligibleForAttempt,
  classifyBinanceWebCandidates,
} from "@/server/payment/binance-web-policy";
import {
  binanceWebAccountFingerprint,
  classifyBinanceWebAccountProof,
} from "@/server/payment/binance-web-session";

const CREATED_AT = new Date("2026-09-08T01:00:00.000Z");
const EXPIRES_AT = new Date("2026-09-08T01:05:00.000Z");
const ORDER_ID = "448515289526009856";
const FINGERPRINT = "a".repeat(64);

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "web-txn-1",
    accountFingerprint: FINGERPRINT,
    providerTransactionId: "txn-1",
    providerOrderId: ORDER_ID,
    transactionType: "C2C",
    direction: "INCOME",
    providerStatus: "SUCCESS",
    providerStatusDetail: "PAID",
    currency: "USDT",
    amountMicros: 5_000_001n,
    counterpartyName: "Buyer",
    receiverBinanceId: "567896636",
    occurredAt: new Date("2026-09-08T01:03:00.000Z"),
    status: "RECEIVED",
    binanceInternalPaymentAttemptId: null,
    ...overrides,
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    verifierMode: "WEB_SESSION",
    binanceAccountFingerprintSnapshot: FINGERPRINT,
    expectedUsdtMicros: 5_000_001n,
    recipientBinanceIdSnapshot: "567896636",
    submittedOrderId: ORDER_ID,
    submittedAt: new Date("2026-09-08T01:04:00.000Z"),
    status: "VERIFIED",
    expiresAt: EXPIRES_AT,
    verificationExpiresAt: new Date("2026-09-08T02:05:00.000Z"),
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe("Binance web matching policy", () => {
  it("accepts one exact unclaimed provider transaction", () => {
    expect(binanceWebTransactionEligibleForAttempt({
      transaction: transaction(),
      attempt: attempt(),
    })).toBe(true);
  });

  it.each([
    ["wrong amount", { amountMicros: 5_000_002n }],
    ["wrong currency", { currency: "FDUSD" }],
    ["outgoing", { direction: "PAYOUT" }],
    ["not complete", { providerStatus: "PROCESSING" }],
    ["wrong recipient", { receiverBinanceId: "987654321" }],
    ["wrong account", { accountFingerprint: "b".repeat(64) }],
    ["wrong order", { providerOrderId: "998515289526009856" }],
    ["outside time", { occurredAt: new Date("2026-09-08T01:08:00.001Z") }],
    ["already claimed", { binanceInternalPaymentAttemptId: "attempt-2" }],
  ])("rejects %s", (_label, overrides) => {
    expect(binanceWebTransactionEligibleForAttempt({
      transaction: transaction(overrides),
      attempt: attempt(),
    })).toBe(false);
  });

  it("accepts numeric and M_P_ Order ID aliases", () => {
    expect(binanceWebTransactionEligibleForAttempt({
      transaction: transaction({ providerOrderId: `M_P_${ORDER_ID}` }),
      attempt: attempt(),
    })).toBe(true);
  });

  it("fails closed when more than one provider row matches the same invoice", () => {
    expect(classifyBinanceWebCandidates(attempt(), [
      transaction(),
      transaction({ id: "web-txn-2", providerTransactionId: ORDER_ID }),
    ])).toEqual({ outcome: "AMBIGUOUS" });
    expect(classifyBinanceWebCandidates(attempt(), [
      transaction({ providerOrderId: "998515289526009856" }),
    ])).toEqual({ outcome: "UNMATCHED" });
  });

  it("revalidates a bound transaction before financial confirmation", () => {
    expect(binanceWebTransactionBlockReason({
      transaction: transaction({
        status: "MATCHED",
        binanceInternalPaymentAttemptId: "attempt-1",
      }),
      attempt: attempt(),
      now: new Date("2026-09-08T01:06:00.000Z"),
    })).toBeNull();
    expect(binanceWebTransactionBlockReason({
      transaction: transaction({
        status: "MATCHED",
        binanceInternalPaymentAttemptId: "attempt-1",
        receiverBinanceId: null,
      }),
      attempt: attempt(),
    })).toBe("Binance web recipient mismatch");
  });
});

describe("Binance web account binding", () => {
  it("requires explicit provider evidence for a new session", () => {
    expect(classifyBinanceWebAccountProof({
      expectedRecipientBinanceId: "567896636",
      sessionStatus: "PENDING_VALIDATION",
      observedReceiverBinanceIds: [],
    })).toBe("UNPROVEN");
    expect(classifyBinanceWebAccountProof({
      expectedRecipientBinanceId: "567896636",
      sessionStatus: "PENDING_VALIDATION",
      observedReceiverBinanceIds: ["567896636"],
    })).toBe("PROVEN");
  });

  it("rejects a changed receiver and accepts an already proven active binding", () => {
    expect(classifyBinanceWebAccountProof({
      expectedRecipientBinanceId: "567896636",
      sessionStatus: "ACTIVE",
      storedAccountFingerprint: binanceWebAccountFingerprint("567896636"),
      observedReceiverBinanceIds: [],
    })).toBe("PROVEN");
    expect(classifyBinanceWebAccountProof({
      expectedRecipientBinanceId: "567896636",
      sessionStatus: "ACTIVE",
      storedAccountFingerprint: binanceWebAccountFingerprint("567896636"),
      observedReceiverBinanceIds: ["987654321"],
    })).toBe("MISMATCH");
  });
});
