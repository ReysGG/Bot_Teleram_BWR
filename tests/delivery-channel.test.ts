import { describe, expect, it, vi } from "vitest";
import {
  queueOrderDigitalDelivery,
  queueOrderPaymentSuccess,
  webDeliveryDedupeKey,
} from "@/server/orders/delivery-channel";

describe("order delivery channel routing", () => {
  it("routes web stock to READY receipts and never Telegram notifications", async () => {
    const tx = {
      sentDelivery: {
        createMany: vi.fn().mockResolvedValue({ count: 2 }),
        findMany: vi.fn().mockResolvedValue([
          { orderId: "order-1", stockItemId: "stock-1", channel: "WEB" },
          { orderId: "order-1", stockItemId: "stock-2", channel: "WEB" },
        ]),
      },
      telegramNotification: { createMany: vi.fn() },
    };

    await queueOrderDigitalDelivery(tx as never, {
      orderId: "order-1",
      chatId: "web:customer-1",
      channel: "WEB",
      stockItemIds: ["stock-1", "stock-2"],
    });

    expect(tx.telegramNotification.createMany).not.toHaveBeenCalled();
    expect(tx.sentDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dedupeKey: webDeliveryDedupeKey("order-1", "stock-1"),
          channel: "WEB",
          status: "READY",
        }),
        expect.objectContaining({
          dedupeKey: webDeliveryDedupeKey("order-1", "stock-2"),
          channel: "WEB",
          status: "READY",
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("keeps payment-success notifications Telegram-only", async () => {
    const tx = {
      telegramNotification: { upsert: vi.fn().mockResolvedValue({}) },
      sentDelivery: { createMany: vi.fn(), findMany: vi.fn() },
    };
    await queueOrderPaymentSuccess(tx as never, { id: "web-order", chatId: "web:customer", channel: "WEB" });
    expect(tx.telegramNotification.upsert).not.toHaveBeenCalled();
    await queueOrderPaymentSuccess(tx as never, { id: "tg-order", chatId: "123", channel: "TELEGRAM" });
    expect(tx.telegramNotification.upsert).toHaveBeenCalledTimes(1);
  });
});
