import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { releasePendingWalletContribution } from "@/server/wallet/payment-release";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { usdtBep20AttemptBlocksOrderClosure } from "@/server/payment/usdt-bep20-policy";
import { binanceInternalAttemptBlocksOrderClosure } from "@/server/payment/binance-internal-policy";
import { jagoTransferClosureStatus } from "@/server/payment/jago-transfer-policy";
import { blockedBannedStockWhere } from "@/server/stock/sellable";

export async function cancelPendingOrder(input: {
  orderId: string;
  chatId: string;
}) {
  const orderProduct = await prisma.orderItem.findFirst({
    where: { orderId: input.orderId },
    select: { productId: true },
  });
  if (!orderProduct) throw new Error("Order tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, orderProduct.productId);
    await lockOrderPaymentTransition(tx, input.orderId);

    const order = await tx.order.findFirst({
      where: { id: input.orderId, chatId: input.chatId },
      include: { payment: true, items: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true },
    });
    if (!order || !order.payment) throw new Error("Order tidak ditemukan");
    if (order.status === "CANCELLED") return order;
    if (
      order.status !== "PENDING_PAYMENT" ||
      order.paymentStatus !== "PENDING" ||
      order.payment.status !== "PENDING"
    ) {
      throw new Error("Order ini sudah tidak dapat dibatalkan");
    }
    if (usdtBep20AttemptBlocksOrderClosure(order.usdtBep20Attempt)) {
      throw new Error(
        "Transfer USDT sedang diverifikasi dan belum dapat dibatalkan",
      );
    }
    if (
      binanceInternalAttemptBlocksOrderClosure(
        order.binanceInternalPaymentAttempt,
      )
    ) {
      throw new Error(
        "Pembayaran Binance Pay sedang diverifikasi dan belum dapat dibatalkan",
      );
    }

    const now = new Date();
    await tx.payment.update({
      where: { id: order.payment.id },
      data: { status: "EXPIRED" },
    });
    await tx.bridgePaymentClaim.updateMany({
      where: { orderId: order.id },
      data: { status: "CANCELLED" },
    });
    await tx.usdtBep20Attempt.updateMany({
      where: {
        orderId: order.id,
        status: {
          in: [
            "AWAITING_TX_HASH",
            "VERIFYING",
            "PENDING_CONFIRMATIONS",
            "REJECTED",
          ],
        },
      },
      data: { status: "EXPIRED" },
    });
    await tx.binanceInternalPaymentAttempt.updateMany({
      where: {
        orderId: order.id,
        status: { in: ["AWAITING_ORDER_ID", "VERIFYING", "REJECTED"] },
      },
      data: { status: "EXPIRED" },
    });
    await tx.jagoTransferAttempt.updateMany({
      where: {
        orderId: order.id,
        status: "AWAITING_TRANSFER",
        matchedEventId: null,
      },
      data: { status: jagoTransferClosureStatus("cancel") },
    });
    await tx.qrisInvoiceAttempt.updateMany({
      where: {
        orderId: order.id,
        status: { in: ["AWAITING_PAYMENT", "MATCHED"] },
      },
      data: { status: "CANCELLED" },
    });
    await tx.orderItem.updateMany({
      where: { orderId: order.id, stockItemId: { not: null } },
      data: { stockItemId: null },
    });
    await tx.digitalStockItem.updateMany({
      where: {
        reservedOrderId: order.id,
        status: "RESERVED",
        ...blockedBannedStockWhere(),
      },
      data: {
        status: "BANNED",
        reservedOrderId: null,
        reservedAt: null,
      },
    });
    await tx.digitalStockItem.updateMany({
      where: { reservedOrderId: order.id, status: "RESERVED" },
      data: {
        status: "AVAILABLE",
        reservedOrderId: null,
        reservedAt: null,
      },
    });
    await releasePendingWalletContribution(tx, {
      orderId: order.id,
      chatId: order.chatId,
      buyerUsername: order.buyerUsername,
      buyerDisplayName: order.buyerDisplayName,
      reason: "cancelled",
    });
    return tx.order.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        paymentStatus: "EXPIRED",
        stockReleasedAt: now,
      },
      include: { payment: true, items: true },
    });
  });
}
