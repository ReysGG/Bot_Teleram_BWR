import { prisma } from "@/server/db/prisma";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { walletRefundDedupeKey } from "@/server/telegram/delivery-key";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { isSellableStock } from "@/server/stock/sellable";

export async function refundFailedDeliveryToWallet(input: {
  orderId: string;
  notificationId: string;
  reason: string;
}) {
  const orderProduct = await prisma.orderItem.findFirst({
    where: { orderId: input.orderId },
    select: { productId: true },
  });
  if (!orderProduct) throw new Error("Order refund tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, orderProduct.productId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_delivery_refund_${input.orderId}`}))`;
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true, items: true },
    });
    if (!order || !order.payment) throw new Error("Order refund tidak ditemukan");

    const notification = await tx.telegramNotification.findFirst({
      where: {
        id: input.notificationId,
        orderId: order.id,
        kind: "DIGITAL_FILE",
        status: "FAILED",
      },
    });
    const receipt = await tx.sentDelivery.findFirst({
      where: { orderId: order.id, status: "FAILED" },
      orderBy: { createdAt: "desc" },
    });
    if (!notification || !receipt) {
      throw new Error("Delivery belum terbukti gagal secara pasti");
    }
    if (order.status === "PAID_WAITING_STOCK") {
      throw new Error("Preorder yang menunggu stok tidak boleh direfund otomatis");
    }
    if (order.status === "COMPLETED") {
      throw new Error("Order yang sudah terkirim tidak boleh direfund");
    }
    const unsafeDelivery = await tx.sentDelivery.findFirst({
      where: {
        orderId: order.id,
        status: { in: ["SENDING", "SENT", "UNKNOWN"] },
      },
      select: { id: true, status: true },
    });
    if (unsafeDelivery) {
      throw new Error(
        "Sebagian file mungkin sudah terkirim; refund otomatis diblokir untuk review manual",
      );
    }

    const ledger = await applyWalletTransaction(tx, {
      chatId: order.chatId,
      amount: order.grandTotal,
      type: "DELIVERY_REFUND",
      idempotencyKey: `delivery-refund:${order.id}`,
      orderId: order.id,
      identity: {
        buyerUsername: order.buyerUsername,
        buyerDisplayName: order.buyerDisplayName,
      },
      actor: "system:telegram-delivery",
      note: `Refund ${order.invoiceNumber}: ${input.reason.slice(0, 250)}`,
    });

    if (order.status !== "REFUNDED") {
      await tx.telegramNotification.updateMany({
        where: {
          orderId: order.id,
          kind: "DIGITAL_FILE",
          id: { not: input.notificationId },
          status: { in: ["PENDING", "PROCESSING"] },
        },
        data: {
          status: "FAILED",
          leaseUntil: null,
          lastError: "Order direfund sebelum file berhasil dikirim",
        },
      });
      const stockItemIds = order.items.flatMap((item) =>
        item.stockItemId ? [item.stockItemId] : [],
      );
      const stocks = stockItemIds.length > 0
        ? await tx.digitalStockItem.findMany({
            where: { id: { in: stockItemIds } },
            include: { product: { select: { bannedStockPolicy: true } } },
          })
        : [];
      const releasable = stocks.filter(
        (stock) => stock.status === "RESERVED" && stock.reservedOrderId === order.id,
      );
      const availableIds = releasable.flatMap((stock) =>
        stock.healthStatus === "BANNED" &&
        !isSellableStock({
          healthStatus: stock.healthStatus,
          healthHttpStatus: stock.healthHttpStatus,
          bannedSaleApprovedAt: stock.bannedSaleApprovedAt,
          bannedStockPolicy: stock.product.bannedStockPolicy,
        })
          ? []
          : [stock.id],
      );
      const availableIdSet = new Set(availableIds);
      const bannedIds = releasable
        .filter((stock) => !availableIdSet.has(stock.id))
        .map((stock) => stock.id);

      await tx.orderItem.updateMany({
        where: { orderId: order.id, stockItemId: { not: null } },
        data: { stockItemId: null },
      });
      if (availableIds.length > 0) {
        await tx.digitalStockItem.updateMany({
          where: { id: { in: availableIds }, status: "RESERVED", reservedOrderId: order.id },
          data: {
            status: "AVAILABLE",
            reservedOrderId: null,
            reservedAt: null,
          },
        });
      }
      if (bannedIds.length > 0) {
        await tx.digitalStockItem.updateMany({
          where: { id: { in: bannedIds }, status: "RESERVED", reservedOrderId: order.id },
          data: {
            status: "BANNED",
            reservedOrderId: null,
            reservedAt: null,
          },
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED", refundedAt: new Date() },
      });
    }

    const dedupeKey = walletRefundDedupeKey(order.id);
    await tx.telegramNotification.upsert({
      where: { dedupeKey },
      create: {
        dedupeKey,
        chatId: order.chatId,
        orderId: order.id,
        kind: "WALLET_REFUND",
        priority: 20,
      },
      update: {},
    });
    return ledger;
  });
}
