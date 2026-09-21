import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  setAvailability: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/payment/method-availability", () => ({
  setPaymentMethodAvailability: mocks.setAvailability,
}));

import { POST } from "@/app/api/admin/payment-settings/method-availability/route";

describe("admin payment method availability route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the complete central toggle snapshot with an admin audit actor", async () => {
    const response = await POST(new NextRequest(
      "https://store.example/api/admin/payment-settings/method-availability",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://store.example",
        },
        body: new URLSearchParams({
          returnTo: "/admin/payment-settings",
          qrisDanaEnabled: "true",
          walletCheckoutEnabled: "true",
          mixedWalletQrisEnabled: "false",
          walletTopupEnabled: "false",
          jagoTransferEnabled: "true",
          binanceInternalEnabled: "false",
          usdtBep20Enabled: "false",
        }),
      },
    ));

    expect(mocks.setAvailability).toHaveBeenCalledWith({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: true,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: false,
      jagoTransferEnabled: true,
      binanceInternalEnabled: false,
      usdtBep20Enabled: false,
      actor: "admin:owner@example.test",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings?notice=payment_methods",
    );
  });

  it("falls back to the dedicated settings page for an unsafe return path", async () => {
    const response = await POST(new NextRequest(
      "https://store.example/api/admin/payment-settings/method-availability",
      {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          origin: "https://store.example",
        },
        body: new URLSearchParams({
          returnTo: "https://attacker.example/steal",
          qrisDanaEnabled: "true",
          walletCheckoutEnabled: "true",
          mixedWalletQrisEnabled: "false",
          walletTopupEnabled: "false",
          jagoTransferEnabled: "false",
          binanceInternalEnabled: "false",
          usdtBep20Enabled: "false",
        }),
      },
    ));

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings?notice=payment_methods",
    );
  });
});
