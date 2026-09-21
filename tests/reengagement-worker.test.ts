import { describe, expect, it } from "vitest";
import {
  reengagementDeliveryBlockReason,
  reengagementReplyMarkup,
} from "@/server/telegram/delivery-worker";

describe("Telegram re-engagement worker", () => {
  it("uses catalog, order, and menu callbacks without external URLs", () => {
    expect(reengagementReplyMarkup()).toEqual({
      inline_keyboard: [
        [{ text: "🛍️ Lihat katalog", callback_data: "catalog" }],
        [{ text: "📦 Order saya", callback_data: "orders" }],
        [{ text: "🏠 Menu utama", callback_data: "menu" }],
      ],
    });
  });

  it("fails closed when the feature is disabled after queueing", () => {
    expect(reengagementDeliveryBlockReason({
      enabled: false,
      messageText: "Kembali lihat katalog",
    })).toBe("Re-engagement dinonaktifkan sebelum pengiriman");
    expect(reengagementDeliveryBlockReason({
      enabled: true,
      messageText: null,
    })).toBe("Re-engagement notification has no message text");
    expect(reengagementDeliveryBlockReason({
      enabled: true,
      messageText: "Kembali lihat katalog",
    })).toBeNull();
  });
});
