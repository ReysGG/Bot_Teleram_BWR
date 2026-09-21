import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
  createAdminBroadcast: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));
vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));
vi.mock("@/server/telegram/admin-broadcast", () => ({
  createAdminBroadcast: mocks.createAdminBroadcast,
}));

import { POST } from "@/app/api/admin/broadcasts/route";

function request(body: URLSearchParams) {
  return new NextRequest("https://store.example/api/admin/broadcasts", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body,
  });
}

describe("formatted admin broadcast route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminBroadcast.mockResolvedValue({ recipientCount: 12 });
  });

  it("stores validated website formatting as Telegram entities", async () => {
    const response = await POST(request(new URLSearchParams({
      title: "Promo CDK",
      message: "Gunakan kode HEMAT",
      messageEntities: JSON.stringify([
        { type: "bold", offset: 13, length: 5 },
      ]),
    })));

    expect(mocks.createAdminBroadcast).toHaveBeenCalledWith({
      title: "Promo CDK",
      messageText: "Gunakan kode HEMAT",
      messageEntities: [{ type: "bold", offset: 13, length: 5 }],
      createdBy: "owner@example.test",
    });
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts?notice=queued&recipients=12",
    );
  });

  it("returns a specific formatter error for unsafe links", async () => {
    const response = await POST(request(new URLSearchParams({
      title: "Promo CDK",
      message: "Klik situs",
      messageEntities: JSON.stringify([
        { type: "text_link", offset: 0, length: 4, url: "http://unsafe.example" },
      ]),
    })));

    expect(mocks.createAdminBroadcast).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts?error=broadcast-format",
    );
  });
});
