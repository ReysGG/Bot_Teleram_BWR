import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_FORM_RESPONSE_HEADER,
  ADMIN_FORM_RESPONSE_JSON,
} from "@/lib/admin-form-response";

const mocks = vi.hoisted(() => ({
  setDescription: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
}));

vi.mock("@/server/redeem/settings", () => ({
  MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH: 3_000,
  setAccountRedeemDescription: mocks.setDescription,
}));

import { POST } from "@/app/api/admin/redeem-settings/route";

function request(input: Record<string, string>, enhanced = false) {
  return new NextRequest("https://store.example/api/admin/redeem-settings", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
      ...(enhanced
        ? { [ADMIN_FORM_RESPONSE_HEADER]: ADMIN_FORM_RESPONSE_JSON }
        : {}),
    },
    body: new URLSearchParams(input),
  });
}

describe("redeem description admin route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setDescription.mockResolvedValue(undefined);
  });

  it("keeps the native redirect fallback", async () => {
    const response = await POST(request({ intent: "save", description: "Pesan panjang" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/redeem?notice=description-updated",
    );
  });

  it("returns JSON success for enhanced forms", async () => {
    const response = await POST(request(
      { intent: "save", description: "Pesan panjang" },
      true,
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/admin/redeem?notice=description-updated",
    });
  });

  it("returns a stable JSON validation error without changing the setting", async () => {
    const response = await POST(request(
      { intent: "save", description: "   " },
      true,
    ));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "description",
    });
    expect(mocks.setDescription).not.toHaveBeenCalled();
  });
});
