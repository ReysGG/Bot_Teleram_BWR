import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adjustWalletBalance: vi.fn(),
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/wallet/ledger", () => ({
  adjustWalletBalance: mocks.adjustWalletBalance,
}));

import { POST } from "@/app/api/admin/wallet/[chatId]/adjust/route";

function request(returnTo: string) {
  return new NextRequest("https://store.example/api/admin/wallet/123/adjust", {
    method: "POST",
    body: new URLSearchParams({
      amount: "37000",
      direction: "credit",
      note: "Pembayaran terlambat sudah masuk",
      returnTo,
    }),
  });
}

describe("admin wallet adjustment route navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns to the same filtered wallet section after adding balance", async () => {
    const response = await POST(
      request("/admin/wallet/123?txPage=4&orderPage=2&q=invoice#wallet-adjustment"),
      { params: Promise.resolve({ chatId: "123" }) },
    );

    expect(mocks.adjustWalletBalance).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "123",
      amount: 37_000,
      actor: "admin:owner@example.test",
    }));
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/wallet/123?txPage=4&orderPage=2&q=invoice&notice=adjusted#wallet-adjustment",
    );
  });

  it("rejects an external return URL", async () => {
    const response = await POST(
      request("https://evil.example/steal"),
      { params: Promise.resolve({ chatId: "123" }) },
    );

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/wallet/123?notice=adjusted",
    );
  });
});
