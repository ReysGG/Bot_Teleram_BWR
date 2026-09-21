import { describe, expect, it } from "vitest";
import { JAGO_ANDROID_PACKAGE } from "@/server/payment/android-payment-provider";
import { normalizeJagoAccountNumber } from "@/server/payment/jago-transfer-setting";
import { isManualJagoPaymentConfirmation } from "@/server/payment/confirm-payment";
import {
  jagoTransferClosureStatus,
  jagoTransferConfirmationBlockReason,
  type JagoTransferConfirmationEvidence,
} from "@/server/payment/jago-transfer-policy";

const createdAt = new Date("2026-08-21T10:00:00.000Z");
const expiresAt = new Date("2026-08-21T10:05:00.000Z");

function evidence(
  overrides: Partial<JagoTransferConfirmationEvidence> = {},
): JagoTransferConfirmationEvidence {
  return {
    bridgeEventId: "jago-event-1",
    payment: { billedAmount: 25_347, createdAt, expiresAt },
    attempt: {
      status: "AWAITING_TRANSFER",
      matchedEventId: null,
      expiresAt,
    },
    event: {
      eventId: "jago-event-1",
      source: "ANDROID",
      provider: "JAGO",
      packageName: JAGO_ANDROID_PACKAGE,
      amount: 25_347,
      postedAt: new Date("2026-08-21T10:03:00.000Z"),
      status: "RECEIVED",
    },
    ...overrides,
  };
}

describe("Bank Jago transfer confirmation policy", () => {
  it("accepts exact provider, amount, event state, and payment window evidence", () => {
    expect(jagoTransferConfirmationBlockReason(evidence())).toBeNull();
  });

  it("does not allow an admin or other manual caller to bypass notification evidence", () => {
    expect(
      jagoTransferConfirmationBlockReason(
        evidence({ bridgeEventId: undefined, event: null }),
      ),
    ).toContain("requires Android notification evidence");
  });

  it("allows only the explicit audited admin recovery path without an event", () => {
    expect(isManualJagoPaymentConfirmation({
      paymentMethod: "JAGO_TRANSFER",
      verifiedBy: "admin:owner@example.test",
      allowManualJagoOverride: true,
    })).toBe(true);
    expect(isManualJagoPaymentConfirmation({
      paymentMethod: "JAGO_TRANSFER",
      verifiedBy: "system:worker",
      allowManualJagoOverride: true,
    })).toBe(false);
    expect(isManualJagoPaymentConfirmation({
      paymentMethod: "JAGO_TRANSFER",
      verifiedBy: "admin:owner@example.test",
      allowManualJagoOverride: false,
    })).toBe(false);
  });

  it("rejects a DANA event even when the IDR amount is identical", () => {
    const base = evidence();
    expect(
      jagoTransferConfirmationBlockReason({
        ...base,
        event: { ...base.event!, provider: "DANA", packageName: "id.dana" },
      }),
    ).toContain("Bank Jago Android event");
  });

  it("accepts a rejected event only through explicit admin reconciliation", () => {
    const base = evidence();
    expect(
      jagoTransferConfirmationBlockReason({
        ...base,
        event: { ...base.event!, status: "REJECTED" },
      }),
    ).toContain("not available");
    expect(
      jagoTransferConfirmationBlockReason({
        ...base,
        allowRejectedEvent: true,
        event: { ...base.event!, status: "REJECTED" },
      }),
    ).toBeNull();
  });

  it("rejects expired or otherwise out-of-window notification evidence", () => {
    const base = evidence();
    expect(
      jagoTransferConfirmationBlockReason({
        ...base,
        event: {
          ...base.event!,
          postedAt: new Date("2026-08-21T10:10:00.001Z"),
        },
      }),
    ).toContain("outside the invoice window");
  });

  it("maps cancellation and expiry to distinct terminal attempt states", () => {
    expect(jagoTransferClosureStatus("cancel")).toBe("CANCELLED");
    expect(jagoTransferClosureStatus("expire")).toBe("EXPIRED");
  });

  it("normalizes configured account numbers without embedding a real account", () => {
    expect(normalizeJagoAccountNumber("1234 5678 9012")).toBe("123456789012");
    expect(() => normalizeJagoAccountNumber("rekening-jago")).toThrow();
  });
});
