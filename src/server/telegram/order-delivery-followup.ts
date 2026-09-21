import type { Prisma } from "@/generated/prisma/client";
import { queueProductPostDeliveryNotifications } from "@/server/products/post-delivery";
import { successChannelId } from "@/server/telegram/success-channel";

export const ORDER_DELIVERY_FOLLOWUP_KIND = "ORDER_DELIVERY_FOLLOWUP";
// Customer fulfillment must drain before public catalog broadcasts. Payment
// success is priority 1 and the main credential delivery is priority 2.
export const ORDER_DELIVERY_FOLLOWUP_PRIORITY = 3;
export const PRODUCT_ATTACHMENT_PRIORITY = 4;
export const SUCCESS_CHANNEL_PRIORITY = 80;

export type OrderDeliveryFollowupState = {
  status: string;
  paymentStatus: string;
  paymentProviderStatus: string | null;
  stockItemIds: Array<string | null>;
  receipts: Array<{
    stockItemId: string;
    chatId: string;
    status: string;
  }>;
  chatId: string;
};

export function orderDeliveryFollowupDedupeKey(orderId: string) {
  return `order-delivery-followup:${orderId}`;
}

export function orderDeliveryFollowupReadiness(
  order: OrderDeliveryFollowupState,
): { state: "READY" | "WAITING" | "BLOCKED"; reason: string | null } {
  if (
    order.paymentStatus !== "PAID" ||
    order.paymentProviderStatus !== "PAID"
  ) {
    return {
      state: "BLOCKED",
      reason: `Customer follow-up blocked because payment is ${order.paymentStatus}/${order.paymentProviderStatus ?? "MISSING"}`,
    };
  }
  if (order.status === "FULFILLING") {
    return {
      state: "WAITING",
      reason: "Customer follow-up is waiting for digital delivery completion",
    };
  }
  if (order.status !== "COMPLETED") {
    return {
      state: "BLOCKED",
      reason: `Customer follow-up blocked because order is ${order.status}`,
    };
  }
  if (order.stockItemIds.length === 0 || order.stockItemIds.some((id) => !id)) {
    return {
      state: "BLOCKED",
      reason: "Customer follow-up blocked because order stock allocation is incomplete",
    };
  }

  const receiptByStockId = new Map(
    order.receipts.map((receipt) => [receipt.stockItemId, receipt]),
  );
  for (const stockItemId of order.stockItemIds as string[]) {
    const receipt = receiptByStockId.get(stockItemId);
    if (!receipt) {
      return {
        state: "BLOCKED",
        reason: "Customer follow-up blocked because a delivery receipt is missing",
      };
    }
    if (receipt.chatId !== order.chatId) {
      return {
        state: "BLOCKED",
        reason: "Customer follow-up blocked because a delivery receipt has another recipient",
      };
    }
    if (receipt.status === "SENDING") {
      return {
        state: "WAITING",
        reason: "Customer follow-up is waiting for Telegram delivery confirmation",
      };
    }
    if (receipt.status !== "SENT") {
      return {
        state: "BLOCKED",
        reason: `Customer follow-up blocked because a delivery receipt is ${receipt.status}`,
      };
    }
  }

  return { state: "READY", reason: null };
}

export async function queueOrderDeliveryFollowup(input: {
  tx: Prisma.TransactionClient;
  orderId: string;
  chatId: string;
}) {
  const dedupeKey = orderDeliveryFollowupDedupeKey(input.orderId);
  await input.tx.telegramNotification.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      chatId: input.chatId,
      orderId: input.orderId,
      kind: ORDER_DELIVERY_FOLLOWUP_KIND,
      priority: ORDER_DELIVERY_FOLLOWUP_PRIORITY,
    },
    update: {},
  });
}

export async function queueCompletedOrderFollowups(input: {
  tx: Prisma.TransactionClient;
  order: {
    id: string;
    chatId: string;
    invoiceNumber: string;
    items: Array<{
      productId: string;
      productNameSnapshot: string;
    }>;
  };
}) {
  const productIds = [...new Set(input.order.items.map((item) => item.productId))];
  const attachmentProducts = await input.tx.product.findMany({
    where: {
      id: { in: productIds },
      attachmentEncryptedPayload: { not: null },
    },
    select: { id: true },
  });
  for (const product of attachmentProducts) {
    const dedupeKey = `product-attachment:${input.order.id}:${product.id}`;
    await input.tx.telegramNotification.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        chatId: input.order.chatId,
        orderId: input.order.id,
        productId: product.id,
        kind: "PRODUCT_ATTACHMENT",
        priority: PRODUCT_ATTACHMENT_PRIORITY,
      },
      update: {},
    });
  }

  await queueProductPostDeliveryNotifications({
    tx: input.tx,
    orderId: input.order.id,
    chatId: input.order.chatId,
    invoiceNumber: input.order.invoiceNumber,
    products: input.order.items.map((item) => ({
      id: item.productId,
      name: item.productNameSnapshot,
    })),
  });

  const successChatId = successChannelId();
  if (successChatId) {
    const dedupeKey = `success-channel:order:${input.order.id}`;
    await input.tx.telegramNotification.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        chatId: successChatId,
        orderId: input.order.id,
        kind: "SUCCESS_CHANNEL",
        priority: SUCCESS_CHANNEL_PRIORITY,
      },
      update: {},
    });
  }
}
