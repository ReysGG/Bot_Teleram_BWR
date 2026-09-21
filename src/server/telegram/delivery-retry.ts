import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { DIGITAL_DELIVERY_PRIORITY } from "@/server/telegram/delivery-key";

export function deliveryRetryBlockReason(input: {
  receiptStatus: string;
  notificationStatus: string | null;
  orderStatus: string;
  refundedAt: Date | null;
  hasRefundTransaction: boolean;
  hasAmbiguousDelivery: boolean;
  stockStillAssigned: boolean;
  stockStatus: string;
  reservedOrderMatches: boolean;
}): string | null {
  if (
    input.receiptStatus !== "FAILED" ||
    !["FAILED", "PENDING"].includes(input.notificationStatus ?? "")
  ) {
    return "Hanya pengiriman yang terbukti gagal yang dapat dicoba ulang";
  }
  if (
    input.refundedAt ||
    input.hasRefundTransaction ||
    ["REFUNDED", "CANCELLED", "COMPLETED"].includes(input.orderStatus)
  ) {
    return "Order sudah selesai, dibatalkan, atau direfund";
  }
  if (input.hasAmbiguousDelivery) {
    return "Ada pengiriman ambigu yang harus diperiksa manual terlebih dahulu";
  }
  if (
    !input.stockStillAssigned ||
    input.stockStatus !== "RESERVED" ||
    !input.reservedOrderMatches
  ) {
    return "Alokasi stok order sudah berubah";
  }
  return null;
}

export async function queueFailedDeliveryRetry(deliveryId: string) {
  const deliveryProduct = await prisma.sentDelivery.findUnique({
    where: { id: deliveryId },
    select: { stockItem: { select: { productId: true } } },
  });
  if (!deliveryProduct) throw new Error("Delivery tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, deliveryProduct.stockItem.productId);
    const delivery = await tx.sentDelivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          include: {
            items: { select: { stockItemId: true } },
            walletTransactions: {
              where: { type: "DELIVERY_REFUND" },
              select: { id: true },
              take: 1,
            },
          },
        },
        stockItem: true,
      },
    });
    if (!delivery) throw new Error("Delivery tidak ditemukan");

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_delivery_retry_${delivery.orderId}`}))`;
    const [notification, ambiguousDelivery] = await Promise.all([
      tx.telegramNotification.findUnique({ where: { dedupeKey: delivery.dedupeKey } }),
      tx.sentDelivery.findFirst({
        where: {
          orderId: delivery.orderId,
          status: { in: ["SENDING", "UNKNOWN"] },
        },
        select: { id: true },
      }),
    ]);
    const blockReason = deliveryRetryBlockReason({
      receiptStatus: delivery.status,
      notificationStatus: notification?.status ?? null,
      orderStatus: delivery.order.status,
      refundedAt: delivery.order.refundedAt,
      hasRefundTransaction: delivery.order.walletTransactions.length > 0,
      hasAmbiguousDelivery: Boolean(ambiguousDelivery),
      stockStillAssigned: delivery.order.items.some(
        (item) => item.stockItemId === delivery.stockItemId,
      ),
      stockStatus: delivery.stockItem.status,
      reservedOrderMatches: delivery.stockItem.reservedOrderId === delivery.orderId,
    });
    if (blockReason) throw new Error(blockReason);

    const queued = await tx.telegramNotification.updateMany({
      where: {
        id: notification!.id,
        kind: "DIGITAL_FILE",
        status: { in: ["FAILED", "PENDING"] },
      },
      data: {
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: new Date(),
        priority: DIGITAL_DELIVERY_PRIORITY,
        leaseUntil: null,
        lastError: null,
      },
    });
    if (queued.count !== 1) throw new Error("Status pengiriman berubah");
    return { deliveryId: delivery.id, orderId: delivery.orderId };
  });
}

/**
 * An UNKNOWN receipt means Telegram did not give us a definitive result. An
 * operator may explicitly attest that the buyer did not receive the file;
 * only then can the receipt be converted to a retryable failure. Keeping this
 * separate from the normal retry path prevents timeout retries from becoming
 * an accidental duplicate delivery.
 */
export async function queueAcknowledgedMissingDeliveryRetry(deliveryId: string) {
  const deliveryProduct = await prisma.sentDelivery.findUnique({
    where: { id: deliveryId },
    select: { stockItem: { select: { productId: true } } },
  });
  if (!deliveryProduct) throw new Error("Delivery tidak ditemukan");
  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, deliveryProduct.stockItem.productId);
    const delivery = await tx.sentDelivery.findUnique({
      where: { id: deliveryId },
      include: { order: { include: { items: { select: { stockItemId: true } }, walletTransactions: { where: { type: "DELIVERY_REFUND" }, select: { id: true }, take: 1 } } }, stockItem: true },
    });
    if (!delivery) throw new Error("Delivery tidak ditemukan");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_delivery_retry_${delivery.orderId}`}))`;
    const notification = await tx.telegramNotification.findUnique({ where: { dedupeKey: delivery.dedupeKey } });
    if (delivery.status !== "UNKNOWN" || !notification || notification.kind !== "DIGITAL_FILE") throw new Error("Pengiriman ini bukan hasil ambigu yang dapat dipulihkan");
    if (delivery.telegramMessageId || delivery.order.refundedAt || delivery.order.walletTransactions.length > 0 || ["REFUNDED", "CANCELLED", "COMPLETED"].includes(delivery.order.status)) throw new Error("Order sudah memiliki hasil atau tidak dapat dikirim ulang");
    if (delivery.stockItem.status !== "RESERVED" || delivery.stockItem.reservedOrderId !== delivery.orderId || !delivery.order.items.some((item) => item.stockItemId === delivery.stockItemId)) throw new Error("Alokasi stok order sudah berubah");
    await tx.sentDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "Operator mengonfirmasi file belum diterima; retry satu kali diizinkan" } });
    const queued = await tx.telegramNotification.updateMany({
      where: { id: notification.id, status: { in: ["FAILED", "PENDING", "SENT"] } },
      data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), priority: DIGITAL_DELIVERY_PRIORITY, leaseUntil: null, lastError: null },
    });
    if (queued.count !== 1) throw new Error("Status pengiriman berubah");
    return { deliveryId: delivery.id, orderId: delivery.orderId };
  });
}

export async function queueFailedDeliveryRetries(deliveryIds: string[]) {
  let queued = 0;
  let skipped = 0;
  for (const deliveryId of [...new Set(deliveryIds)]) {
    try {
      await queueFailedDeliveryRetry(deliveryId);
      queued += 1;
    } catch {
      skipped += 1;
    }
  }
  return { queued, skipped };
}
