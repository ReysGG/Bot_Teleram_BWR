import { describe, expect, it } from "vitest";
import {
  normalizeWalletTopupFilter,
  walletTopupFilterWhere,
  walletTopupPresentation,
} from "@/server/admin/wallet-topups";

describe("admin wallet top-up filters", () => {
  it("normalizes supported filters and falls back safely", () => {
    expect(normalizeWalletTopupFilter("PENDING")).toBe("pending");
    expect(normalizeWalletTopupFilter(" paid ")).toBe("paid");
    expect(normalizeWalletTopupFilter("problem")).toBe("problem");
    expect(normalizeWalletTopupFilter("unknown")).toBe("all");
    expect(normalizeWalletTopupFilter(undefined)).toBe("all");
  });

  it("treats terminal, overdue, claim, and rejected-event failures as problems", () => {
    const now = new Date("2026-08-11T03:00:00.000Z");
    const where = walletTopupFilterWhere("problem", now);

    expect(where.OR).toEqual(
      expect.arrayContaining([
        { status: { in: ["EXPIRED", "FAILED"] } },
        { status: "PENDING", expiresAt: { lte: now } },
        { bridgeClaim: { is: { status: "FAILED" } } },
        {
          status: { not: "PAID" },
          bridgeEvents: { some: { status: "REJECTED" } },
        },
      ]),
    );
  });
});

describe("admin wallet top-up presentation", () => {
  const now = new Date("2026-08-11T03:00:00.000Z");
  const future = new Date("2026-08-11T03:05:00.000Z");

  it("distinguishes paid, active pending, and expired top-ups", () => {
    const paid = walletTopupPresentation({
      status: "PAID",
      expiresAt: future,
      verifiedBy: "android:event-1",
      now,
    });
    const pending = walletTopupPresentation({
      status: "PENDING",
      expiresAt: future,
      bridgeClaimStatus: "REGISTERED",
      now,
    });
    const expired = walletTopupPresentation({
      status: "EXPIRED",
      expiresAt: new Date("2026-08-11T02:55:00.000Z"),
      now,
    });

    expect(paid).toMatchObject({ tone: "good", isProblem: false });
    expect(paid.label).toMatch(/berhasil|lunas|paid/i);
    expect(pending).toMatchObject({ tone: "warn", isProblem: false });
    expect(pending.label).toMatch(/menunggu|pending/i);
    expect(expired).toMatchObject({ tone: "bad", isProblem: true });
    expect(expired.label).toMatch(/kedaluwarsa|expired/i);
  });

  it("shows the bridge claim error for an affected pending top-up", () => {
    const presentation = walletTopupPresentation({
      status: "PENDING",
      expiresAt: future,
      bridgeClaimStatus: "FAILED",
      bridgeClaimError: "Relay registration timed out",
      now,
    });

    expect(presentation).toMatchObject({ tone: "bad", isProblem: true });
    expect(presentation.detail).toContain("Relay registration timed out");
  });

  it("shows the latest rejected payment-event reason", () => {
    const presentation = walletTopupPresentation({
      status: "PENDING",
      expiresAt: future,
      bridgeClaimStatus: "REGISTERED",
      eventStatus: "REJECTED",
      eventReason: "Payment amount did not match the claim",
      now,
    });

    expect(presentation).toMatchObject({ tone: "bad", isProblem: true });
    expect(presentation.detail).toContain("Payment amount did not match the claim");
  });
});
