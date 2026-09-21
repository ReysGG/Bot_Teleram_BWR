import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(),
  findOrder: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));
vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    order: { findUniqueOrThrow: mocks.findOrder },
    telegramNotification: { create: mocks.createNotification },
  },
}));

import { POST } from "@/app/api/admin/orders/[id]/message/route";
import { parseAdminMessageSnapshot } from "@/server/telegram/admin-message";

function request(body: URLSearchParams) {
  return new NextRequest("https://store.example/api/admin/orders/order-1/message", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body,
  });
}

describe("formatted admin order message route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findOrder.mockResolvedValue({ id: "order-1", chatId: "1001" });
  });

  it("queues a versioned text/entity snapshot", async () => {
    const response = await POST(request(new URLSearchParams({
      message: "Redeem sekarang",
      messageEntities: JSON.stringify([
        { type: "bold", offset: 0, length: 6 },
      ]),
    })), { params: Promise.resolve({ id: "order-1" }) });

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/orders/order-1?notice=message-queued",
    );
    const create = mocks.createNotification.mock.calls[0][0];
    expect(create.data).toMatchObject({
      chatId: "1001",
      orderId: "order-1",
      kind: "ADMIN_MESSAGE",
      priority: 30,
    });
    expect(parseAdminMessageSnapshot(create.data.messageText)).toEqual({
      text: "Redeem sekarang",
      entities: [{ type: "bold", offset: 0, length: 6 }],
    });
  });

  it("rejects invalid formatter offsets without queueing", async () => {
    const response = await POST(request(new URLSearchParams({
      message: "Pendek",
      messageEntities: JSON.stringify([
        { type: "bold", offset: 50, length: 5 },
      ]),
    })), { params: Promise.resolve({ id: "order-1" }) });

    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/orders/order-1?error=admin-message",
    );
  });
  it("does not queue Telegram messages for Web orders", async () => {
    mocks.findOrder.mockResolvedValue({ id: "order-1", channel: "WEB", chatId: "web:customer" });
    const response = await POST(request(new URLSearchParams({ message: "Test message" })), { params: Promise.resolve({ id: "order-1" }) });
    expect(mocks.createNotification).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain("error=web-message-unavailable");
  });
});
