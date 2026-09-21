import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  prepareValidation: vi.fn(),
  poll: vi.fn(),
  activate: vi.fn(),
  revoke: vi.fn(),
  setting: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
  booleanEnv: (_name: string, fallback: boolean) => fallback,
  optionalEnv: () => undefined,
}));
vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));
vi.mock("@/server/payment/binance-internal-setting", () => ({
  getBinanceInternalSetting: mocks.setting,
}));
vi.mock("@/server/payment/binance-web-session", () => ({
  createBinanceWebSession: mocks.createSession,
  prepareBinanceWebSessionValidation: mocks.prepareValidation,
  selectPrimaryBinanceWebSession: mocks.activate,
  revokeBinanceWebSession: mocks.revoke,
}));
vi.mock("@/server/payment/binance-web-worker", () => ({
  pollBinanceWebSessions: mocks.poll,
}));

import { POST as createSession } from "@/app/api/admin/payment-settings/binance-web/route";
import { POST as validateSession } from "@/app/api/admin/payment-settings/binance-web/[id]/validate/route";
import { POST as activateSession } from "@/app/api/admin/payment-settings/binance-web/[id]/activate/route";
import { POST as revokeSession } from "@/app/api/admin/payment-settings/binance-web/[id]/revoke/route";

function request(path: string, input: Record<string, string> = {}) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body: new URLSearchParams(input),
  });
}

describe("Binance web admin mutation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setting.mockResolvedValue({ recipientId: "567896636" });
    mocks.createSession.mockResolvedValue({ id: "session-1" });
    mocks.prepareValidation.mockResolvedValue({ id: "session-1" });
    mocks.poll.mockResolvedValue({
      sessions: 1,
      leased: 1,
      pages: 1,
      received: 0,
      detailCalls: 0,
      unauthorized: 0,
      rateLimited: 0,
      challenged: 0,
      contractUnknown: 0,
      accountMismatch: 0,
      identityUnproven: 0,
      errors: 0,
    });
    mocks.activate.mockResolvedValue({ id: "session-1", isPrimary: true });
    mocks.revoke.mockResolvedValue({ id: "session-1", status: "REVOKED" });
  });

  it("returns a distinct operator error when Binance rejects the cookie", async () => {
    mocks.poll.mockResolvedValueOnce({
      sessions: 1,
      leased: 1,
      pages: 0,
      received: 0,
      detailCalls: 0,
      unauthorized: 1,
      rateLimited: 0,
      challenged: 0,
      contractUnknown: 0,
      accountMismatch: 0,
      identityUnproven: 0,
      errors: 0,
    });
    const response = await validateSession(request(
      "/api/admin/payment-settings/binance-web/session-1/validate",
    ), { params: Promise.resolve({ id: "session-1" }) });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/binance-web?error=session-auth",
    );
  });

  it("reads the configured recipient on the server and never from form input", async () => {
    const response = await createSession(request(
      "/api/admin/payment-settings/binance-web",
      {
        name: "Primary Binance",
        cookieJson: JSON.stringify([{ domain: ".binance.com", name: "session", path: "/", value: "redacted" }]),
      },
    ));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/binance-web?notice=session-created",
    );
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      recipientBinanceId: "567896636",
      actor: "admin:owner@example.test",
    }));
  });

  it("does not expose cookie parser details in an error redirect", async () => {
    mocks.createSession.mockRejectedValueOnce(new Error("sensitive-cookie-value"));
    const response = await createSession(request(
      "/api/admin/payment-settings/binance-web",
      { name: "Primary Binance", cookieJson: "{}" },
    ));
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/binance-web?error=session-invalid",
    );
    expect(response.headers.get("location")).not.toContain("sensitive");
  });

  it("returns a stable duplicate-session error", async () => {
    mocks.createSession.mockRejectedValueOnce({ code: "P2002" });
    const response = await createSession(request(
      "/api/admin/payment-settings/binance-web",
      {
        name: "Primary Binance",
        cookieJson: JSON.stringify([{ domain: ".binance.com", name: "session", path: "/", value: "redacted" }]),
      },
    ));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/payment-settings/binance-web?error=session-duplicate",
    );
  });

  it("validates, activates, and revokes through distinct dedicated routes", async () => {
    const context = { params: Promise.resolve({ id: "session-1" }) };
    const validated = await validateSession(request(
      "/api/admin/payment-settings/binance-web/session-1/validate",
    ), context);
    expect(validated.headers.get("location")).toContain("notice=session-validated");
    expect(mocks.prepareValidation).toHaveBeenCalledWith({
      id: "session-1",
      actor: "admin:owner@example.test",
    });
    expect(mocks.poll).toHaveBeenCalledWith({ sessionId: "session-1", maxPages: 2 });

    const activated = await activateSession(request(
      "/api/admin/payment-settings/binance-web/session-1/activate",
    ), context);
    expect(activated.headers.get("location")).toContain("notice=session-activated");

    const revoked = await revokeSession(request(
      "/api/admin/payment-settings/binance-web/session-1/revoke",
    ), context);
    expect(revoked.headers.get("location")).toContain("notice=session-revoked");
    expect(mocks.revoke).toHaveBeenCalledWith(
      "session-1",
      "admin:owner@example.test",
    );
  });
});
