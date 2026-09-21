import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findWallet: vi.fn(),
  aggregateOrders: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    botSession: { findUnique: mocks.findSession },
    wallet: { findUnique: mocks.findWallet },
    order: { aggregate: mocks.aggregateOrders },
  },
}));

import { loadTelegramAccountSummary } from "@/server/telegram/account-summary";

describe("Telegram account summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSession.mockResolvedValue({
      buyerUsername: "buyer_test",
      buyerDisplayName: "Daps",
      broadcastEnabled: false,
    });
    mocks.findWallet.mockResolvedValue({ balance: 42_500 });
    mocks.aggregateOrders.mockResolvedValue({
      _count: { _all: 4 },
      _sum: { grandTotal: 350_000 },
    });
  });

  it("loads only the user's own indexed summary", async () => {
    await expect(loadTelegramAccountSummary("chat-1")).resolves.toEqual({
      chatId: "chat-1",
      username: "buyer_test",
      displayName: "Daps",
      walletBalance: 42_500,
      completedOrders: 4,
      totalSpent: 350_000,
      notificationsEnabled: false,
    });
    expect(mocks.aggregateOrders).toHaveBeenCalledWith({
      where: { chatId: "chat-1", status: "COMPLETED" },
      _count: { _all: true },
      _sum: { grandTotal: true },
    });
  });

  it("returns safe defaults for a new chat without wallet history", async () => {
    mocks.findSession.mockResolvedValueOnce(null);
    mocks.findWallet.mockResolvedValueOnce(null);
    mocks.aggregateOrders.mockResolvedValueOnce({
      _count: { _all: 0 },
      _sum: { grandTotal: null },
    });

    await expect(loadTelegramAccountSummary("new-chat")).resolves.toMatchObject({
      chatId: "new-chat",
      walletBalance: 0,
      completedOrders: 0,
      totalSpent: 0,
      notificationsEnabled: true,
    });
  });
});
