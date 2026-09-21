import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  verifyAdminPassword: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  ADMIN_SESSION_COOKIE: "telegram_store_admin",
  assertAdminOrigin: mocks.assertAdminOrigin,
  createAdminSessionToken: vi.fn(() => "session-token"),
  verifyAdminPassword: mocks.verifyAdminPassword,
}));

vi.mock("@/server/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(() => true),
}));

import { GET, POST } from "@/app/api/admin/login/route";

describe("admin login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects direct browser visits from the API endpoint to the login page", () => {
    const response = GET();

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://store.example/admin/login");
  });

  it("redirects rejected login origins back to the UI instead of returning JSON", async () => {
    mocks.assertAdminOrigin.mockImplementationOnce(() => {
      throw new Error("INVALID_ORIGIN");
    });

    const response = await POST(new NextRequest("https://store.example/api/admin/login", {
      method: "POST",
      body: new URLSearchParams({
        email: "owner@example.test",
        password: "not-transmitted",
      }),
    }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/login?error=origin",
    );
    expect(mocks.verifyAdminPassword).not.toHaveBeenCalled();
  });
});
