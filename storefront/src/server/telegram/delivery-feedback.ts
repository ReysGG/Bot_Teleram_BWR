import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const DELIVERY_ACKNOWLEDGED_KIND = "DELIVERY_ACKNOWLEDGED";
export const DELIVERY_MISSING_REPORT_KIND = "DELIVERY_MISSING_REPORT";

export function deliveryAcknowledgedDedupeKey(orderId: string) {
  return `delivery-acknowledged:${orderId}`;
}

export function deliveryMissingReportDedupeKey(orderId: string) {
  return `delivery-missing-report:${orderId}`;
}

export function deliveryFeedbackState(
  notifications: Array<{ kind: string; status: string }>,
) {
  const missingReported = notifications.some(
    (notification) =>
      notification.kind === DELIVERY_MISSING_REPORT_KIND &&
      notification.status === "MANUAL_REVIEW",
  );
  const acknowledged = !missingReported && notifications.some(
    (notification) =>
      notification.kind === DELIVERY_ACKNOWLEDGED_KIND &&
      notification.status === "SENT",
  );
  return { acknowledged, missingReported };
}

async function requireOwnedSentDelivery(
  tx: Prisma.TransactionClient,
  input: { orderId: string; chatId: string },
) {
  const order = await tx.order.findFirst({
    where: { id: input.orderId, chatId: input.chatId },
    select: {
      id: true,
      invoiceNumber: true,
      deliveryReceipts: {
        where: { status: "SENT" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!order) throw new Error("Order tidak ditemukan");
  if (order.deliveryReceipts.length === 0) {
    throw new Error("Belum ada file yang tercatat diterima Telegram");
  }
  return order;
}

export async function acknowledgeOrderDelivery(input: {
  orderId: string;
  chatId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await requireOwnedSentDelivery(tx, input);
    const now = new Date();
    const acknowledgement = await tx.telegramNotification.upsert({
      where: { dedupeKey: deliveryAcknowledgedDedupeKey(order.id) },
      create: {
        dedupeKey: deliveryAcknowledgedDedupeKey(order.id),
        chatId: input.chatId,
        orderId: order.id,
        kind: DELIVERY_ACKNOWLEDGED_KIND,
        messageText: `Pembeli mengonfirmasi file ${order.invoiceNumber} sudah terlihat.`,
        status: "SENT",
        sentAt: now,
      },
      update: {
        chatId: input.chatId,
        status: "SENT",
        sentAt: now,
        lastError: null,
      },
    });
    await tx.telegramNotification.updateMany({
      where: { dedupeKey: deliveryMissingReportDedupeKey(order.id) },
      data: {
        status: "SENT",
        sentAt: now,
        lastError: null,
        messageText: `Laporan file ${order.invoiceNumber} diselesaikan oleh konfirmasi pembeli.`,
      },
    });
    return acknowledgement;
  });
}

export async function reportMissingOrderDelivery(input: {
  orderId: string;
  chatId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const order = await requireOwnedSentDelivery(tx, input);
    return tx.telegramNotification.upsert({
      where: { dedupeKey: deliveryMissingReportDedupeKey(order.id) },
      create: {
        dedupeKey: deliveryMissingReportDedupeKey(order.id),
        chatId: input.chatId,
        orderId: order.id,
        kind: DELIVERY_MISSING_REPORT_KIND,
        messageText: `Pembeli melaporkan file ${order.invoiceNumber} tidak terlihat. Jangan kirim ulang otomatis.`,
        status: "MANUAL_REVIEW",
        lastError: "Buyer reported that a Telegram-accepted delivery is not visible",
      },
      update: {
        chatId: input.chatId,
        status: "MANUAL_REVIEW",
        sentAt: null,
        lastError: "Buyer reported that a Telegram-accepted delivery is not visible",
        messageText: `Pembeli melaporkan file ${order.invoiceNumber} tidak terlihat. Jangan kirim ulang otomatis.`,
      },
    });
  });
}
