import type { Prisma } from "@/generated/prisma/client";
import { successChannelId } from "@/server/telegram/success-channel";

export function completedWebOrderCanAnnounce(order: {
  channel: string; status: string; paymentStatus: string; webCustomerId: string | null;
  payment: { status: string } | null;
  items: Array<{ stockItemId: string | null }>;
  deliveryReceipts: Array<{ stockItemId: string; channel: string; status: string }>;
}) {
  if (order.channel !== "WEB" || !order.webCustomerId || order.status !== "COMPLETED" || order.paymentStatus !== "PAID" || order.payment?.status !== "PAID" || order.items.length === 0) return false;
  const receipts = new Map(order.deliveryReceipts.map(receipt => [receipt.stockItemId, receipt]));
  return order.items.every(item => {
    const receipt = item.stockItemId ? receipts.get(item.stockItemId) : undefined;
    return receipt?.channel === "WEB" && receipt.status === "SENT";
  });
}

export async function queueWebSuccessAnnouncement(tx: Pick<Prisma.TransactionClient, "telegramNotification">, orderId: string) {
  const chatId = successChannelId();
  if (!chatId) return;
  const dedupeKey = `success-channel:order:${orderId}`;
  await tx.telegramNotification.upsert({
    where: { dedupeKey },
    create: { dedupeKey, chatId, orderId, kind: "SUCCESS_CHANNEL", priority: 80 },
    update: {},
  });
}

// Keep evidence of a dispatch attempt through a worker crash. Only a known-safe
// retry clears it; uncertain outcomes must be reviewed instead of posting twice.
export const WEB_SUCCESS_DISPATCH_MARKER = "web-success-dispatch:v1";
