import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockPaymentReconciliationError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    PaymentReconciliationError: MockPaymentReconciliationError,
    assertAdminOrigin: vi.fn(),
    reconcilePaymentEvent: vi.fn(),
    requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
    verifyBinanceInternalAttempt: vi.fn(),
  };
});

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/payment/binance-internal", () => ({
  verifyBinanceInternalAttempt: mocks.verifyBinanceInternalAttempt,
}));

vi.mock("@/server/payment/reconciliation", () => ({
  PaymentReconciliationError: mocks.PaymentReconciliationError,
  reconcilePaymentEvent: mocks.reconcilePaymentEvent,
}));

import { POST as recheckBinance } from "@/app/api/admin/binance-internal/[id]/recheck/route";
import { POST as reconcileEvent } from "@/app/api/admin/payment-events/[id]/reconcile/route";

function request(path: string, body: URLSearchParams) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    body,
  });
}

describe("admin payment mutation navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps Binance verifier pagination and filters", async () => {
    const response = await recheckBinance(
      request(
        "/api/admin/binance-internal/attempt-1/recheck",
        new URLSearchParams({
          returnTo: "/admin/payments/binance?bp=3&bq=invoice&bs=VERIFYING#binance-internal-ledger",
        }),
      ),
      { params: Promise.resolve({ id: "attempt-1" }) },
    );

    expect(mocks.verifyBinanceInternalAttempt).toHaveBeenCalledWith({
      attemptId: "attempt-1",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payments/binance?bp=3&bq=invoice&bs=VERIFYING&notice=binance_internal_rechecked#binance-internal-ledger",
    );
  });

  it("returns reconciliation to the selected event and current ledger page", async () => {
    const response = await reconcileEvent(
      request(
        "/api/admin/payment-events/event-1/reconcile",
        new URLSearchParams({
          reason: "Nominal dan waktu cocok",
          returnTo: "/admin/payments/reconciliation?page=4&q=invoice&status=problem&event=event-1#reconciliation-review",
          targetId: "order-1",
          targetKind: "order",
        }),
      ),
      { params: Promise.resolve({ id: "event-1" }) },
    );

    expect(mocks.reconcilePaymentEvent).toHaveBeenCalledWith({
      eventId: "event-1",
      targetId: "order-1",
      targetKind: "order",
      adminEmail: "owner@example.test",
      reason: "Nominal dan waktu cocok",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payments/reconciliation?page=4&q=invoice&status=problem&event=event-1&notice=reconciled#reconciliation-review",
    );
  });
});
