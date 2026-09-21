import { describe, expect, it, vi } from "vitest";
import { TelegramApiError } from "@/server/telegram/api";
import { fanoutBroadcastNotifications } from "@/server/telegram/broadcast-fanout";
import {
  BROADCAST_NOTIFICATION_KINDS,
  isPermanentTelegramRecipientError,
  shouldSuppressFutureBroadcasts,
} from "@/server/telegram/broadcast-recipient";
import {
  permanentRecipientSessionUpdate,
  permanentRecipientSessionWhere,
} from "@/server/telegram/delivery-worker";

describe("Telegram broadcast scaling", () => {
  it("inserts broadcast recipients in bounded chunks", async () => {
    const recipients = Array.from({ length: 1_205 }, (_, index) => ({
      chatId: String(index + 1).padStart(5, "0"),
    }));
    const findMany = vi.fn(async (query: {
      cursor?: { chatId: string };
      take: number;
    }) => {
      const start = query.cursor
        ? recipients.findIndex((item) => item.chatId === query.cursor?.chatId) + 1
        : 0;
      return recipients.slice(start, start + query.take);
    });
    const createMany = vi.fn(async (query: { data: unknown[] }) => ({
      count: query.data.length,
    }));

    const result = await fanoutBroadcastNotifications({
      tx: {
        botSession: { findMany, findFirst: vi.fn() },
        telegramNotification: { createMany },
      } as never,
      chunkSize: 500,
      maxRecipients: 2_000,
      notificationFor: (chatId) => ({
        dedupeKey: `broadcast:${chatId}`,
        chatId,
        kind: "ADMIN_BROADCAST",
      }),
    });

    expect(result).toEqual({ recipientCount: 1_205, queuedCount: 1_205 });
    expect(createMany.mock.calls.map(([query]) => query.data.length)).toEqual([
      500,
      500,
      205,
    ]);
  });

  it("suppresses future broadcasts for permanent recipient errors only", () => {
    const blocked = new TelegramApiError(
      "Telegram rejected sendMessage: 403 bot was blocked by the user",
      true,
      undefined,
      false,
      403,
    );
    const invalidPayload = new TelegramApiError(
      "Telegram rejected sendMessage: 400 message is too long",
      true,
      undefined,
      false,
      400,
    );

    expect(isPermanentTelegramRecipientError(blocked)).toBe(true);
    expect(isPermanentTelegramRecipientError(invalidPayload)).toBe(false);
    expect(
      shouldSuppressFutureBroadcasts({ kind: "PRODUCT_RESTOCK", error: blocked }),
    ).toBe(true);
    expect(
      shouldSuppressFutureBroadcasts({ kind: "DIGITAL_FILE", error: blocked }),
    ).toBe(false);
    expect(
      shouldSuppressFutureBroadcasts({ kind: "PAYMENT_SUCCESS", error: blocked }),
    ).toBe(false);
    expect(
      shouldSuppressFutureBroadcasts({ kind: "REENGAGEMENT", error: blocked }),
    ).toBe(true);
    expect(BROADCAST_NOTIFICATION_KINDS).toContain("REENGAGEMENT");
    expect(permanentRecipientSessionUpdate()).toEqual({
      broadcastEnabled: false,
      telegramReachable: false,
    });
    expect(permanentRecipientSessionWhere("opted-out-chat")).toEqual({
      chatId: "opted-out-chat",
    });
    expect(permanentRecipientSessionWhere("opted-out-chat"))
      .not.toHaveProperty("broadcastEnabled");
  });

  it("recognizes permanent 400 chat errors but not transient failures", () => {
    expect(
      isPermanentTelegramRecipientError(
        new TelegramApiError(
          "Telegram rejected sendMessage: 400 Bad Request: chat not found",
          true,
          undefined,
          false,
          400,
        ),
      ),
    ).toBe(true);
    expect(
      isPermanentTelegramRecipientError(
        new TelegramApiError(
          "Telegram rejected sendMessage: 503 upstream unavailable",
          true,
          undefined,
          true,
          503,
        ),
      ),
    ).toBe(false);
  });
});
