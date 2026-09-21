import { describe, expect, it } from "vitest";
import {
  isPaymentEventWithinWindow,
  orderReconciliationState,
  paymentEventDiagnostic,
  sanitizeReconciliationReason,
} from "@/server/payment/reconciliation";

describe("payment reconciliation safety", () => {
  const createdAt = new Date("2026-08-11T10:00:00.000Z");
  const expiresAt = new Date("2026-08-11T10:05:00.000Z");

  it("accepts bridge clock skew but rejects events outside the safe window", () => {
    expect(isPaymentEventWithinWindow({
      postedAt: new Date("2026-08-11T10:09:59.000Z"),
      createdAt,
      expiresAt,
    })).toBe(true);
    expect(isPaymentEventWithinWindow({
      postedAt: new Date("2026-08-11T10:10:01.000Z"),
      createdAt,
      expiresAt,
    })).toBe(false);
  });

  it("redacts secrets, links, and long provider identifiers from audit notes", () => {
    const safe = sanitizeReconciliationReason(
      `Bearer secret-token https://provider.example/path ${"a".repeat(64)} cocok`,
    );
    expect(safe).not.toContain("secret-token");
    expect(safe).not.toContain("provider.example");
    expect(safe).not.toContain("a".repeat(64));
    expect(safe).toContain("cocok");
  });

  it("shows ambiguity without leaking the raw backend reason", () => {
    expect(paymentEventDiagnostic("REJECTED", "ambiguous targets: internal-id"))
      .toEqual(expect.objectContaining({
        label: "Nominal ganda",
        isProblem: true,
      }));
  });

  it("does not treat a stale pending order as an expired reconciliation target", () => {
    expect(orderReconciliationState({
      orderStatus: "PENDING_PAYMENT",
      orderPaymentStatus: "PENDING",
      paymentStatus: "PENDING",
      expiresAt,
      now: new Date("2026-08-11T10:06:00.000Z"),
    })).toBe("unavailable");
  });

  it("only allows late wallet credit after the order and payment are fully expired", () => {
    expect(orderReconciliationState({
      orderStatus: "EXPIRED",
      orderPaymentStatus: "EXPIRED",
      paymentStatus: "EXPIRED",
      expiresAt,
      now: new Date("2026-08-11T10:06:00.000Z"),
    })).toBe("expired");
    expect(orderReconciliationState({
      orderStatus: "EXPIRED",
      orderPaymentStatus: "EXPIRED",
      paymentStatus: "PENDING",
      expiresAt,
      now: new Date("2026-08-11T10:06:00.000Z"),
    })).toBe("unavailable");
  });

  it("keeps an unexpired pending order eligible for normal confirmation", () => {
    expect(orderReconciliationState({
      orderStatus: "PENDING_PAYMENT",
      orderPaymentStatus: "PENDING",
      paymentStatus: "PENDING",
      expiresAt,
      now: new Date("2026-08-11T10:04:00.000Z"),
    })).toBe("active");
  });
});
