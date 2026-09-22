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
      status: true,
      paymentStatus: true,
      refundedAt: true,
      items: { select: { id: true, stockItemId: true, sellerIdSnapshot: true } },
      deliveryReceipts: {
        where: { status: "SENT" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!order) throw new Error("Order tidak ditemukan");
  if (order.paymentStatus !== "PAID" || order.refundedAt || ["CANCELLED", "REFUNDED"].includes(order.status)) throw new Error("Order belum eligible untuk approval");
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
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-feedback:${input.orderId}`}))`;
    const order = await requireOwnedSentDelivery(tx, input);
    const missing = await tx.telegramNotification.findUnique({ where: { dedupeKey: deliveryMissingReportDedupeKey(order.id) }, select: { status: true } });
    if (missing?.status === "MANUAL_REVIEW") throw new Error("Delivery sedang dalam review manual");
    const now = new Date();
    const acknowledgement = await tx.telegramNotification.upsert({
      where: { dedupeKey: deliveryAcknowledgedDedupeKey(order.id) },
      create: {
        dedupeKey: deliveryAcknowledgedDedupeKey(order.id),
        chatId: input.chatId,
        orderId: order.id,
        kind: DELIVERY_ACKNOWLEDGED_KIND,
        messageText: `Pembeli mengonfirmasi file ${order.invoiceNumber} sudah diterima.`,
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
        messageText: `Laporan produk ${order.invoiceNumber} diselesaikan oleh konfirmasi usability pembeli.`,
      },
    });
    return acknowledgement;
  });
}

/** Buyer approval is the settlement gate. A rating is optional and separate. */
export async function releaseSellerEarningsAfterApproval(
  tx: Prisma.TransactionClient,
  orderId: string,
  actor: string,
) {
  const items = await tx.orderItem.findMany({
    where: { orderId, sellerIdSnapshot: { not: null } },
    select: { id: true, stockItemId: true, sellerIdSnapshot: true, sellerCommissionBpsSnapshot: true, unitPrice: true, sellerHoldSecondsSnapshot: true },
  });
  const sellerIds = [...new Set(items.map(item => item.sellerIdSnapshot).filter((id): id is string => Boolean(id)))].sort();
  for (const sellerId of sellerIds) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-wallet:${sellerId}`}))`;
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { paymentStatus: true, refundedAt: true, status: true, deliveryReceipts: { select: { stockItemId: true, status: true } } } });
  if (order.paymentStatus !== "PAID" || order.refundedAt || ["CANCELLED", "REFUNDED"].includes(order.status)) throw new Error("Order belum eligible untuk settlement seller");
  const delivered = new Set(order.deliveryReceipts.filter(receipt => receipt.status === "SENT").map(receipt => receipt.stockItemId));
  if (items.some(item => !item.stockItemId || !delivered.has(item.stockItemId))) throw new Error("Semua produk seller harus terkirim sebelum approval");
  for (const item of items) {
    if (!item.sellerIdSnapshot) continue;
    const existing = await tx.sellerSale.findUnique({ where: { orderItemId: item.id } });
    if (existing?.status === "AVAILABLE" || existing?.status === "PAID") continue;
    if (existing && existing.status !== "PENDING") throw new Error("seller_sale_not_eligible");
    const commission = Math.floor(item.unitPrice * (item.sellerCommissionBpsSnapshot ?? 0) / 10000);
    const net = item.unitPrice - commission;
    const sale = existing ?? await tx.sellerSale.create({ data: { sellerId: item.sellerIdSnapshot, orderItemId: item.id, gross: item.unitPrice, commission, net, holdSeconds: item.sellerHoldSecondsSnapshot ?? 0, status: "PENDING" } });
    const journalKey = `seller-release:order-item:${item.id}`;
    const journal = await tx.sellerJournal.findUnique({ where: { sourceKey: journalKey }, select: { id: true } });
    if (journal) continue;
    await tx.sellerSale.update({ where: { id: sale.id }, data: { status: "AVAILABLE", eligibleAt: new Date() } });
    await tx.sellerWallet.upsert({ where: { sellerId: item.sellerIdSnapshot }, create: { sellerId: item.sellerIdSnapshot, available: net }, update: { available: { increment: net } } });
    await tx.sellerJournal.create({ data: { sellerId: item.sellerIdSnapshot, sourceKey: journalKey, kind: "BUYER_APPROVED_USABLE", available: net, actor, reason: `Buyer approved usable delivery for order ${orderId}` } });
  }
}

export async function reportMissingOrderDelivery(input: {
  orderId: string;
  chatId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-feedback:${input.orderId}`}))`;
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
