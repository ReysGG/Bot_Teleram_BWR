import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));
vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));
vi.mock("@/server/payment/shopee-partner-session", () => ({
  createShopeePartnerSession: mocks.createSession,
  listShopeePartnerSessions: mocks.listSessions,
  revokeShopeePartnerSession: mocks.revokeSession,
}));

import { POST as createSession } from "@/app/api/admin/payment-settings/shopee/route";
import { POST as revokeSession } from "@/app/api/admin/payment-settings/shopee/[id]/route";

function request(input: Record<string, string>) {
  return new NextRequest("https://store.example/api/admin/payment-settings/shopee", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body: new URLSearchParams(input),
  });
}

describe("Shopee Partner admin mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createSession.mockResolvedValue({ id: "session-1" });
    mocks.revokeSession.mockResolvedValue({ id: "session-1", status: "REVOKED" });
  });

  it("redirects session creation with a stable notice", async () => {
    const response = await createSession(request({
      name: "Primary merchant",
      apiToken: "safe-test-token-value",
      cookieJson: JSON.stringify([{ domain: ".shopee.co.id", name: "SPC_T_ID", path: "/", value: "cookie" }]),
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://store.example/admin/payment-settings/shopee?notice=session-created");
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      apiToken: "safe-test-token-value",
      actor: "admin:owner@example.test",
    }));
  });

  it("does not expose parser errors in the redirect", async () => {
    mocks.createSession.mockRejectedValueOnce(new Error("sensitive upstream detail"));
    const response = await createSession(request({
      name: "Primary merchant",
      apiToken: "safe-test-token-value",
      cookieJson: "{}",
    }));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://store.example/admin/payment-settings/shopee?error=session-invalid");
    expect(response.headers.get("location")).not.toContain("sensitive");
  });

  it("redirects revocation back to its dedicated settings page", async () => {
    const response = await revokeSession(request({}), {
      params: Promise.resolve({ id: "session-1" }),
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://store.example/admin/payment-settings/shopee?notice=session-revoked");
    expect(mocks.revokeSession).toHaveBeenCalledWith("session-1", "admin:owner@example.test");
  });
});
