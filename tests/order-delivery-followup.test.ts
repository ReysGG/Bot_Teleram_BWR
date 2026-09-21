import { afterEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import {
  ORDER_DELIVERY_FOLLOWUP_KIND,
  ORDER_DELIVERY_FOLLOWUP_PRIORITY,
  PRODUCT_ATTACHMENT_PRIORITY,
  SUCCESS_CHANNEL_PRIORITY,
  orderDeliveryFollowupDedupeKey,
  orderDeliveryFollowupReadiness,
  queueCompletedOrderFollowups,
  queueOrderDeliveryFollowup,
} from "@/server/telegram/order-delivery-followup";

function readyOrder() {
  return {
    status: "COMPLETED",
    paymentStatus: "PAID",
    paymentProviderStatus: "PAID",
    stockItemIds: ["stock-1", "stock-2"],
    receipts: [
      { stockItemId: "stock-1", chatId: "123", status: "SENT" },
      { stockItemId: "stock-2", chatId: "123", status: "SENT" },
    ],
    chatId: "123",
  };
}

describe("order delivery follow-up", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_SUCCESS_CHANNEL_ID;
  });

  it("requires paid completed ownership-bound delivery receipts", () => {
    expect(orderDeliveryFollowupReadiness(readyOrder())).toEqual({
      state: "READY",
      reason: null,
    });
    expect(orderDeliveryFollowupReadiness({
      ...readyOrder(),
      status: "FULFILLING",
      receipts: [
        { stockItemId: "stock-1", chatId: "123", status: "SENT" },
        { stockItemId: "stock-2", chatId: "123", status: "SENDING" },
      ],
    }).state).toBe("WAITING");
    expect(orderDeliveryFollowupReadiness({
      ...readyOrder(),
      paymentProviderStatus: "PENDING",
    }).state).toBe("BLOCKED");
    expect(orderDeliveryFollowupReadiness({
      ...readyOrder(),
      receipts: [
        { stockItemId: "stock-1", chatId: "999", status: "SENT" },
        { stockItemId: "stock-2", chatId: "123", status: "SENT" },
      ],
    }).state).toBe("BLOCKED");
    expect(orderDeliveryFollowupReadiness({
      ...readyOrder(),
      receipts: [{ stockItemId: "stock-1", chatId: "123", status: "SENT" }],
    }).state).toBe("BLOCKED");
  });

  it("queues one internal idempotent follow-up stage after delivery commit", async () => {
    const upserts: Array<Record<string, unknown>> = [];
    const tx = {
      telegramNotification: {
        upsert: async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await queueOrderDeliveryFollowup({ tx, orderId: "order-1", chatId: "123" });

    expect(orderDeliveryFollowupDedupeKey("order-1")).toBe(
      "order-delivery-followup:order-1",
    );
    expect(upserts[0]).toMatchObject({
      where: { dedupeKey: "order-delivery-followup:order-1" },
      create: {
        chatId: "123",
        orderId: "order-1",
        kind: ORDER_DELIVERY_FOLLOWUP_KIND,
        priority: ORDER_DELIVERY_FOLLOWUP_PRIORITY,
      },
      update: {},
    });
  });

  it("fans out attachment, guide, and public success rows with stable dedupe keys", async () => {
    process.env.TELEGRAM_SUCCESS_CHANNEL_ID = "-100123";
    const upserts: Array<Record<string, unknown>> = [];
    const tx = {
      product: {
        findMany: async (args: { where?: Record<string, unknown> }) => {
          if (args.where?.attachmentEncryptedPayload) return [{ id: "product-1" }];
          return [{
            id: "product-1",
            postDeliveryInstructions: "Gunakan file yang sudah dikirim.",
            postDeliveryEntities: [],
            redeemUrl: null,
          }];
        },
      },
      telegramNotification: {
        upsert: async (args: Record<string, unknown>) => {
          upserts.push(args);
          return args;
        },
      },
    } as unknown as Prisma.TransactionClient;

    await queueCompletedOrderFollowups({
      tx,
      order: {
        id: "order-1",
        chatId: "123",
        invoiceNumber: "TGS-1",
        items: [
          { productId: "product-1", productNameSnapshot: "CDK" },
          { productId: "product-1", productNameSnapshot: "CDK" },
        ],
      },
    });

    expect(upserts.map((entry) => entry.where)).toEqual([
      { dedupeKey: "product-attachment:order-1:product-1" },
      { dedupeKey: "product-post-delivery:order-1:product-1" },
      { dedupeKey: "success-channel:order:order-1" },
    ]);
    expect((upserts[0].create as { priority: number }).priority).toBe(
      PRODUCT_ATTACHMENT_PRIORITY,
    );
    expect((upserts[2].create as { priority: number }).priority).toBe(
      SUCCESS_CHANNEL_PRIORITY,
    );
  });
});
