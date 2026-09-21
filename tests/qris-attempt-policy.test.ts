import { describe, expect, it } from "vitest";
import { qrisInvoiceEventBlockReason } from "@/server/payment/qris-attempt-policy";
import { SHOPEE_PARTNER_ANDROID_PACKAGE } from "@/server/payment/android-payment-provider";

const createdAt = new Date("2026-08-23T06:00:00.000Z");
const expiresAt = new Date("2026-08-23T06:05:00.000Z");

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    targetKind: "order" as const,
    targetId: "order-1",
    billedAmount: 25_347,
    createdAt,
    expiresAt,
    bridgeClaim: { claimId: "claim-1" },
    attempt: {
      providerKeySnapshot: "DANA",
      allowedPackageNamesSnapshot: ["id.dana", "id.dana.kasir"],
      allowedDeviceIdsSnapshot: ["android-device-1"],
      amount: 25_347,
      status: "AWAITING_PAYMENT",
      matchedEventId: null,
      expiresAt,
    },
    event: {
      eventId: "event-1",
      source: "ANDROID",
      provider: "DANA",
      claimId: null,
      deviceId: "android-device-1",
      packageName: "id.dana",
      amount: 25_347,
      postedAt: new Date("2026-08-23T06:02:00.000Z"),
      status: "RECEIVED",
      orderId: null,
      walletTopupId: null,
    },
    allowRejectedEvent: false,
    ...overrides,
  };
}

describe("provider-aware QRIS payment evidence", () => {
  it("accepts the exact provider and snapshotted Android package", () => {
    expect(qrisInvoiceEventBlockReason(evidence())).toBeNull();
  });

  it("accepts Shopee Partner only from its snapshotted package and device", () => {
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          bridgeClaim: null,
          attempt: {
            ...evidence().attempt,
            providerKeySnapshot: "SHOPEE_PARTNER",
            allowedPackageNamesSnapshot: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          },
          event: {
            ...evidence().event,
            provider: "SHOPEE_PARTNER",
            packageName: SHOPEE_PARTNER_ANDROID_PACKAGE,
          },
        }),
      ),
    ).toBeNull();
  });

  it("allows a validated Shopee Android event only as an explicit fallback for web invoices", () => {
    const webEvidence = evidence({
      bridgeClaim: null,
      attempt: {
        ...evidence().attempt,
        evidenceMode: "WEB_SESSION",
        providerKeySnapshot: "SHOPEE_PARTNER",
        allowedPackageNamesSnapshot: [SHOPEE_PARTNER_ANDROID_PACKAGE],
      },
      event: {
        ...evidence().event,
        provider: "SHOPEE_PARTNER",
        packageName: SHOPEE_PARTNER_ANDROID_PACKAGE,
      },
    });
    expect(qrisInvoiceEventBlockReason(webEvidence)).toContain("web-session");
    expect(qrisInvoiceEventBlockReason({
      ...webEvidence,
      allowShopeeAndroidFallback: true,
    })).toBeNull();
  });

  it("rejects a package or provider from another merchant", () => {
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          event: { ...evidence().event, packageName: "com.example.fake" },
        }),
      ),
    ).toContain("package mismatch");
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: {
            ...evidence().attempt,
            providerKeySnapshot: "SHOPEE_PARTNER",
            allowedPackageNamesSnapshot: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          },
        }),
      ),
    ).toContain("provider mismatch");
  });

  it("requires attempt-backed Android evidence from the snapshotted device", () => {
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          event: { ...evidence().event, deviceId: "another-device" },
        }),
      ),
    ).toContain("device mismatch");
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: {
            ...evidence().attempt,
            allowedDeviceIdsSnapshot: [],
          },
        }),
      ),
    ).toContain("device mismatch");
  });

  it("allows relay evidence only for the DANA snapshot and exact claim", () => {
    const relayEvent = {
      ...evidence().event,
      source: "RELAY",
      provider: null,
      deviceId: null,
      packageName: null,
      claimId: "claim-1",
    };
    expect(qrisInvoiceEventBlockReason(evidence({ event: relayEvent }))).toBeNull();
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: {
            ...evidence().attempt,
            allowedDeviceIdsSnapshot: [],
          },
          event: relayEvent,
        }),
      ),
    ).toBeNull();
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: {
            ...evidence().attempt,
            providerKeySnapshot: "SHOPEE_PARTNER",
            allowedPackageNamesSnapshot: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          },
          event: relayEvent,
        }),
      ),
    ).toContain("does not use the DANA relay");
  });

  it("keeps attempt-less legacy invoices DANA-compatible only", () => {
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: null,
          event: { ...evidence().event, deviceId: null },
        }),
      ),
    ).toBeNull();
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: null,
          event: { ...evidence().event, provider: "SHOPEE_PARTNER" },
        }),
      ),
    ).toContain("provider mismatch");
  });

  it("fails closed after an attempt is matched or terminal", () => {
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: { ...evidence().attempt, status: "CONFIRMED" },
        }),
      ),
    ).toContain("snapshot is not available");
    expect(
      qrisInvoiceEventBlockReason(
        evidence({
          attempt: { ...evidence().attempt, matchedEventId: "event-row-2" },
        }),
      ),
    ).toContain("snapshot is not available");
  });
});
