import type { OrderChannel, Prisma } from "@/generated/prisma/client";
import {
  DIGITAL_DELIVERY_PRIORITY,
  PAYMENT_SUCCESS_PRIORITY,
  digitalDeliveryDedupeKey,
  paymentSuccessDedupeKey,
  preorderCancellationDedupeKey,
  walletRefundDedupeKey,
} from "@/server/telegram/delivery-key";

type DeliveryClient = Pick<
  Prisma.TransactionClient,
  "sentDelivery" | "telegramNotification"
>;

export function webDeliveryDedupeKey(orderId: string, stockItemId: string) {
  return `web-delivery:${orderId}:${stockItemId}`;
}

export async function queueOrderPaymentSuccess(
  tx: DeliveryClient,
  order: { id: string; chatId: string; channel: OrderChannel },
) {
  if (order.channel === "WEB") return;
  const dedupeKey = paymentSuccessDedupeKey(order.id);
  await tx.telegramNotification.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      chatId: order.chatId,
      orderId: order.id,
      kind: "PAYMENT_SUCCESS",
      priority: PAYMENT_SUCCESS_PRIORITY,
    },
    update: {},
  });
}

export async function queueOrderWalletRefund(
  tx: DeliveryClient,
  order: { id: string; chatId: string; channel: OrderChannel },
  messageText: string,
) {
  if (order.channel === "WEB") return;
  const dedupeKey = walletRefundDedupeKey(order.id);
  await tx.telegramNotification.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      chatId: order.chatId,
      orderId: order.id,
      kind: "WALLET_REFUND",
      messageText,
      priority: 10,
    },
    update: {},
  });
}

export async function queueOrderPreorderCancellation(
  tx: DeliveryClient,
  order: { id: string; chatId: string; channel: OrderChannel },
  reason: string,
) {
  if (order.channel === "WEB") return;
  const dedupeKey = preorderCancellationDedupeKey(order.id);
  await tx.telegramNotification.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      chatId: order.chatId,
      orderId: order.id,
      kind: "PREORDER_CANCELLED",
      messageText: reason,
      priority: 10,
    },
    update: {},
  });
}

export async function queueOrderDigitalDelivery(
  tx: DeliveryClient,
  input: {
    orderId: string;
    chatId: string;
    channel: OrderChannel;
    stockItemIds: string[];
  },
) {
  const stockItemIds = [...new Set(input.stockItemIds)];
  if (stockItemIds.length === 0) return;
  if (input.channel === "TELEGRAM") {
    await tx.telegramNotification.createMany({
      data: stockItemIds.map((stockItemId) => ({
        dedupeKey: digitalDeliveryDedupeKey(input.orderId, stockItemId),
        chatId: input.chatId,
        orderId: input.orderId,
        stockItemId,
        kind: "DIGITAL_FILE",
        priority: DIGITAL_DELIVERY_PRIORITY,
      })),
      skipDuplicates: true,
    });
    return;
  }

  await tx.sentDelivery.createMany({
    data: stockItemIds.map((stockItemId) => ({
      dedupeKey: webDeliveryDedupeKey(input.orderId, stockItemId),
      orderId: input.orderId,
      stockItemId,
      chatId: input.chatId,
      channel: "WEB" as const,
      status: "READY" as const,
    })),
    skipDuplicates: true,
  });
  const receipts = await tx.sentDelivery.findMany({
    where: { stockItemId: { in: stockItemIds } },
    select: { orderId: true, stockItemId: true, channel: true },
  });
  if (
    receipts.length !== stockItemIds.length ||
    receipts.some((receipt) =>
      receipt.orderId !== input.orderId || receipt.channel !== "WEB",
    )
  ) {
    throw new Error("Web delivery stock already belongs to another delivery channel");
  }
}
