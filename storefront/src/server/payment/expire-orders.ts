import { prisma } from "@/server/db/prisma";
import { enqueueProductRestock } from "@/server/telegram/product-broadcast";
import { releasePendingWalletContribution } from "@/server/wallet/payment-release";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { jagoTransferClosureStatus } from "@/server/payment/jago-transfer-policy";
import { blockedBannedStockWhere } from "@/server/stock/sellable";

export async function expirePendingOrders(limit = 100): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: {
      status: "PENDING_PAYMENT",
      expiresAt: { lte: new Date() },
      AND: [
        {
          OR: [
            { usdtBep20Attempt: null },
            { usdtBep20Attempt: { is: { status: { in: ["AWAITING_TX_HASH", "REJECTED", "EXPIRED"] } } } },
            { usdtBep20Attempt: { is: { status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] }, verificationExpiresAt: { lte: new Date() } } } },
          ],
        },
        {
          OR: [
            { binanceInternalPaymentAttempt: null },
            { binanceInternalPaymentAttempt: { is: { status: { in: ["AWAITING_ORDER_ID", "REJECTED", "EXPIRED"] } } } },
            { binanceInternalPaymentAttempt: { is: { status: "VERIFYING", verificationExpiresAt: { lte: new Date() } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      chatId: true,
      buyerUsername: true,
      buyerDisplayName: true,
      isPreorder: true,
      items: { select: { productId: true }, take: 1 },
    },
    orderBy: { expiresAt: "asc" },
    take: limit,
  });
  let expired = 0;

  for (const candidate of candidates) {
    const didExpire = await prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, candidate.items[0]?.productId);
      await lockOrderPaymentTransition(tx, candidate.id);
      const now = new Date();
      const updated = await tx.order.updateMany({
        where: {
          id: candidate.id,
          status: "PENDING_PAYMENT",
          paymentStatus: "PENDING",
          expiresAt: { lte: now },
          payment: { is: { status: "PENDING" } },
          AND: [
            {
              OR: [
                { usdtBep20Attempt: null },
                { usdtBep20Attempt: { is: { status: { in: ["AWAITING_TX_HASH", "REJECTED", "EXPIRED"] } } } },
                { usdtBep20Attempt: { is: { status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] }, verificationExpiresAt: { lte: now } } } },
              ],
            },
            {
              OR: [
                { binanceInternalPaymentAttempt: null },
                { binanceInternalPaymentAttempt: { is: { status: { in: ["AWAITING_ORDER_ID", "REJECTED", "EXPIRED"] } } } },
                { binanceInternalPaymentAttempt: { is: { status: "VERIFYING", verificationExpiresAt: { lte: now } } } },
              ],
            },
          ],
        },
        data: {
          status: "EXPIRED",
          paymentStatus: "EXPIRED",
          ...(candidate.isPreorder ? {} : { stockReleasedAt: now }),
        },
      });
      if (updated.count === 0) return { expired: false, released: 0 };

      await tx.payment.updateMany({
        where: { orderId: candidate.id, status: "PENDING" },
        data: { status: "EXPIRED" },
      });
      await tx.bridgePaymentClaim.updateMany({
        where: { orderId: candidate.id },
        data: { status: "EXPIRED" },
      });
      await tx.usdtBep20Attempt.updateMany({
        where: {
          orderId: candidate.id,
          OR: [
            { status: { in: ["AWAITING_TX_HASH", "REJECTED"] } },
            {
              status: { in: ["VERIFYING", "PENDING_CONFIRMATIONS"] },
              verificationExpiresAt: { lte: now },
            },
          ],
        },
        data: { status: "EXPIRED" },
      });
      await tx.binanceInternalPaymentAttempt.updateMany({
        where: {
          orderId: candidate.id,
          OR: [
            { status: { in: ["AWAITING_ORDER_ID", "REJECTED"] } },
            { status: "VERIFYING", verificationExpiresAt: { lte: now } },
          ],
        },
        data: { status: "EXPIRED" },
      });
      await tx.jagoTransferAttempt.updateMany({
        where: {
          orderId: candidate.id,
          status: "AWAITING_TRANSFER",
          matchedEventId: null,
        },
        data: { status: jagoTransferClosureStatus("expire") },
      });
      await tx.qrisInvoiceAttempt.updateMany({
        where: {
          orderId: candidate.id,
          status: { in: ["AWAITING_PAYMENT", "MATCHED"] },
        },
        data: { status: "EXPIRED" },
      });
      await tx.orderItem.updateMany({
        where: { orderId: candidate.id, stockItemId: { not: null } },
        data: { stockItemId: null },
      });
      await tx.digitalStockItem.updateMany({
        where: {
          reservedOrderId: candidate.id,
          status: "RESERVED",
          ...blockedBannedStockWhere(),
        },
        data: {
          status: "BANNED",
          reservedOrderId: null,
          reservedAt: null,
        },
      });
      const released = await tx.digitalStockItem.updateMany({
        where: { reservedOrderId: candidate.id, status: "RESERVED" },
        data: {
          status: "AVAILABLE",
          reservedOrderId: null,
          reservedAt: null,
        },
      });
      await releasePendingWalletContribution(tx, {
        orderId: candidate.id,
        chatId: candidate.chatId,
        buyerUsername: candidate.buyerUsername,
        buyerDisplayName: candidate.buyerDisplayName,
        reason: "expired",
      });
      return { expired: true, released: released.count };
    });
    if (didExpire.expired) {
      expired += 1;
      const productId = candidate.items[0]?.productId;
      if (didExpire.released > 0 && productId) {
        await enqueueProductRestock({
          productId,
          addedCount: didExpire.released,
          batchId: `expired-${candidate.id}`,
        });
      }
    }
  }

  return expired;
}
