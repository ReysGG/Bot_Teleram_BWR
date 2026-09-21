import { describe, expect, it } from "vitest";
import {
  DANA_ANDROID_PACKAGES,
  JAGO_ANDROID_PACKAGE,
  JAGO_TRANSFER_METHOD,
  SHOPEE_PARTNER_ANDROID_PACKAGE,
} from "@/server/payment/android-payment-provider";
import { reconciliationPaymentProvider } from "@/server/payment/reconciliation";
import {
  DANA_WALLET_TOPUP_METHOD,
  walletTopupEventBlockReason,
} from "@/server/wallet/topup";

const createdAt = new Date("2026-08-22T08:00:00.000Z");
const expiresAt = new Date("2026-08-22T08:05:00.000Z");

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "wallet-topup-event-1",
    source: "ANDROID",
    provider: "JAGO",
    claimId: null,
    deviceId: "android-device-1",
    packageName: JAGO_ANDROID_PACKAGE,
    amount: 10_091,
    postedAt: new Date("2026-08-22T08:02:00.000Z"),
    status: "RECEIVED",
    orderId: null,
    walletTopupId: null,
    ...overrides,
  };
}

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    walletTopupId: "topup-1",
    paymentMethod: JAGO_TRANSFER_METHOD,
    billedAmount: 10_091,
    createdAt,
    expiresAt,
    bridgeClaim: null,
    jagoTransferAttempt: {
      status: "AWAITING_TRANSFER",
      matchedEventId: null,
      expiresAt,
    },
    event: event(),
    allowRejectedEvent: false,
    ...overrides,
  };
}

describe("provider-aware wallet top up evidence", () => {
  it("accepts exact Bank Jago Android evidence", () => {
    expect(walletTopupEventBlockReason(evidence())).toBeNull();
  });

  it("rejects cross-provider evidence even when the amount is identical", () => {
    expect(
      walletTopupEventBlockReason(
        evidence({
          event: event({
            provider: "DANA",
            packageName: DANA_ANDROID_PACKAGES[0],
          }),
        }),
      ),
    ).toContain("Bank Jago Android event");
  });

  it("accepts DANA Android and relay evidence only for DANA top ups", () => {
    expect(
      walletTopupEventBlockReason(
        evidence({
          paymentMethod: DANA_WALLET_TOPUP_METHOD,
          jagoTransferAttempt: null,
          event: event({
            provider: "DANA",
            packageName: DANA_ANDROID_PACKAGES[0],
          }),
        }),
      ),
    ).toBeNull();

    expect(
      walletTopupEventBlockReason(
        evidence({
          paymentMethod: DANA_WALLET_TOPUP_METHOD,
          bridgeClaim: { claimId: "claim-1" },
          jagoTransferAttempt: null,
          event: event({
            source: "RELAY",
            provider: null,
            packageName: null,
            claimId: "claim-1",
          }),
        }),
      ),
    ).toBeNull();
  });

  it("binds snapshotted QRIS top ups to the configured Android device", () => {
    const qrisInvoiceAttempt = {
      providerKeySnapshot: "DANA",
      allowedPackageNamesSnapshot: [...DANA_ANDROID_PACKAGES],
      allowedDeviceIdsSnapshot: ["android-device-1"],
      amount: 10_091,
      status: "AWAITING_PAYMENT",
      matchedEventId: null,
      expiresAt,
    };
    expect(
      walletTopupEventBlockReason(
        evidence({
          paymentMethod: DANA_WALLET_TOPUP_METHOD,
          jagoTransferAttempt: null,
          qrisInvoiceAttempt,
          event: event({
            provider: "DANA",
            packageName: DANA_ANDROID_PACKAGES[0],
          }),
        }),
      ),
    ).toBeNull();
    expect(
      walletTopupEventBlockReason(
        evidence({
          paymentMethod: DANA_WALLET_TOPUP_METHOD,
          jagoTransferAttempt: null,
          qrisInvoiceAttempt,
          event: event({
            provider: "DANA",
            deviceId: "another-device",
            packageName: DANA_ANDROID_PACKAGES[0],
          }),
        }),
      ),
    ).toContain("device mismatch");
  });

  it("rejects a second target and only permits rejected events for admin reconciliation", () => {
    expect(
      walletTopupEventBlockReason(
        evidence({ event: event({ walletTopupId: "another-topup" }) }),
      ),
    ).toContain("already linked");
    expect(
      walletTopupEventBlockReason(
        evidence({ event: event({ status: "REJECTED" }) }),
      ),
    ).toContain("not available");
    expect(
      walletTopupEventBlockReason(
        evidence({
          event: event({ status: "REJECTED", walletTopupId: "topup-1" }),
          allowRejectedEvent: true,
        }),
      ),
    ).toBeNull();
  });
});

describe("payment reconciliation provider boundary", () => {
  it("maps only trusted relay and Android sources", () => {
    expect(
      reconciliationPaymentProvider({
        source: "RELAY",
        provider: null,
        packageName: null,
      }),
    ).toBe("DANA");
    expect(
      reconciliationPaymentProvider({
        source: "ANDROID",
        provider: "DANA",
        packageName: DANA_ANDROID_PACKAGES[0],
      }),
    ).toBe("DANA");
    expect(
      reconciliationPaymentProvider({
        source: "ANDROID",
        provider: "JAGO",
        packageName: JAGO_ANDROID_PACKAGE,
      }),
    ).toBe("JAGO");
    expect(
      reconciliationPaymentProvider({
        source: "ANDROID",
        provider: "SHOPEE_PARTNER",
        packageName: SHOPEE_PARTNER_ANDROID_PACKAGE,
      }),
    ).toBe("SHOPEE_PARTNER");
  });

  it("rejects spoofed provider/package combinations", () => {
    expect(
      reconciliationPaymentProvider({
        source: "ANDROID",
        provider: "JAGO",
        packageName: DANA_ANDROID_PACKAGES[0],
      }),
    ).toBeNull();
    expect(
      reconciliationPaymentProvider({
        source: "ANDROID",
        provider: "DANA",
        packageName: SHOPEE_PARTNER_ANDROID_PACKAGE,
      }),
    ).toBeNull();
    expect(
      reconciliationPaymentProvider({
        source: "UNKNOWN",
        provider: "DANA",
        packageName: DANA_ANDROID_PACKAGES[0],
      }),
    ).toBeNull();
  });
});
