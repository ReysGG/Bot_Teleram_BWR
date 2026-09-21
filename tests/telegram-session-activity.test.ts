import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    botSession: {
      upsert: mocks.upsert,
    },
  },
}));

vi.mock("@/server/checkout/create-order", () => ({
  normalizeOrderQuantity: (value?: number) => value ?? 1,
}));

import { rememberTelegramUser } from "@/server/telegram/session-state";

describe("Telegram inbound activity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T03:30:00.000Z"));
    mocks.upsert.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks inbound activity and starts a fresh re-engagement sequence", async () => {
    await rememberTelegramUser("7398144015", {
      id: 7398144015,
      username: "buyer_name",
      first_name: "Buyer",
      language_code: "id",
    });

    const inboundAt = new Date("2026-08-24T03:30:00.000Z");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { chatId: "7398144015" },
      create: expect.objectContaining({
        chatId: "7398144015",
        buyerUsername: "buyer_name",
        locale: "id",
        lastInboundAt: inboundAt,
        reengagementSequence: 0,
        telegramReachable: true,
      }),
      update: expect.objectContaining({
        buyerUsername: "buyer_name",
        lastInboundAt: inboundAt,
        reengagementSequence: 0,
        telegramReachable: true,
      }),
    });

    const update = mocks.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty("broadcastEnabled");
    expect(update).not.toHaveProperty("reengagementLastQueuedAt");
  });
});
