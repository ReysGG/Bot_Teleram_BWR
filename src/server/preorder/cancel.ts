import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { queueOrderPreorderCancellation } from "@/server/orders/delivery-channel";
import { applyWalletTransaction } from "@/server/wallet/ledger";

export async function cancelPaidPreorder(input: {
  orderId: string;
  actor: string;
  reason: string;
}) {
  const reason = input.reason.trim().slice(0, 500);
  if (reason.length < 3) throw new Error("Alasan pembatalan wajib diisi");
  const orderProduct = await prisma.orderItem.findFirst({
    where: { orderId: input.orderId },
    select: { productId: true },
  });
  if (!orderProduct) throw new Error("Preorder tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, orderProduct.productId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_payment_${input.orderId}`}))`;

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        payment: true,
        items: { include: { stockItem: { select: { status: true } } } },
        deliveryReceipts: { select: { id: true, status: true } },
      },
    });
    if (!order || !order.payment || !order.isPreorder) {
      throw new Error("Preorder tidak ditemukan");
    }

    const idempotencyKey = `preorder-cancel-refund:${order.id}`;
    if (order.status === "REFUNDED") {
      const existing = await tx.walletTransaction.findUnique({
        where: { idempotencyKey },
      });
      if (existing) return { order, transaction: existing };
      throw new Error("Order sudah direfund melalui proses lain");
    }
    if (
      order.status !== "PAID_WAITING_STOCK" ||
      order.paymentStatus !== "PAID" ||
      order.payment.status !== "PAID" ||
      order.items.some(
        (item) => item.stockItemId !== null || item.stockItem?.status === "DELIVERED",
      ) ||
      order.deliveryReceipts.length > 0
    ) {
      throw new Error(
        "Hanya preorder lunas yang masih menunggu stok yang dapat dibatalkan",
      );
    }

    const transaction = await applyWalletTransaction(tx, {
      chatId: order.chatId,
      amount: order.grandTotal,
      type: "PREORDER_CANCEL_REFUND",
      idempotencyKey,
      orderId: order.id,
      identity: {
        buyerUsername: order.buyerUsername,
        buyerDisplayName: order.buyerDisplayName,
      },
      actor: input.actor,
      note: `Pembatalan preorder ${order.invoiceNumber}: ${reason}`,
    });
    const now = new Date();
    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        status: "REFUNDED",
        refundedAt: now,
        waitingStockAt: null,
      },
      include: { payment: true, items: true },
    });

    await queueOrderPreorderCancellation(tx, order, reason);
    return { order: updated, transaction };
  });
}
