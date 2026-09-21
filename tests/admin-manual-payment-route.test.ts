import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class MockAdminManualPaymentError extends Error {
    readonly code: string;
    constructor(code: string) {
      super(code);
      this.code = code;
    }
  }
  return {
    AdminManualPaymentError: MockAdminManualPaymentError,
    approveOrderPaymentManually: vi.fn(),
    approveWalletTopupManually: vi.fn(),
    assertAdminOrigin: vi.fn(),
    requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
  };
});

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/payment/admin-manual-approval", () => ({
  AdminManualPaymentError: mocks.AdminManualPaymentError,
  approveOrderPaymentManually: mocks.approveOrderPaymentManually,
  approveWalletTopupManually: mocks.approveWalletTopupManually,
}));

import { POST as confirmOrder } from "@/app/api/admin/orders/[id]/confirm/route";
import { POST as confirmTopup } from "@/app/api/admin/wallet/topups/[id]/confirm/route";

function request(path: string, returnTo: string) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    body: new URLSearchParams({ returnTo }),
  });
}

describe("admin manual payment routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the shared order approval service and returns to the originating page", async () => {
    const response = await confirmOrder(
      request("/api/admin/orders/order-1/confirm", "/admin/orders/order-1"),
      { params: Promise.resolve({ id: "order-1" }) },
    );

    expect(mocks.approveOrderPaymentManually).toHaveBeenCalledWith({
      orderId: "order-1",
      adminEmail: "owner@example.test",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/orders/order-1?notice=payment-confirmed",
    );
  });

  it("returns a stable domain error and blocks external return URLs", async () => {
    mocks.approveOrderPaymentManually.mockRejectedValueOnce(
      new mocks.AdminManualPaymentError("payment_expired"),
    );
    const response = await confirmOrder(
      request("/api/admin/orders/order-2/confirm", "https://evil.example/steal"),
      { params: Promise.resolve({ id: "order-2" }) },
    );

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin?error=payment_expired",
    );
  });

  it("routes wallet top ups through the same explicit admin service", async () => {
    const response = await confirmTopup(
      request("/api/admin/wallet/topups/topup-1/confirm", "/admin/wallet#topup-history"),
      { params: Promise.resolve({ id: "topup-1" }) },
    );

    expect(mocks.approveWalletTopupManually).toHaveBeenCalledWith({
      walletTopupId: "topup-1",
      adminEmail: "owner@example.test",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/wallet?notice=topup-confirmed#topup-history",
    );
  });
});
