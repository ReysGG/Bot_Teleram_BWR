import { prisma } from "@/server/db/prisma";
import { releaseSellerEarningsAfterApproval } from "@/server/telegram/delivery-feedback";

export class UsabilityApprovalError extends Error {}

/** Receipt acknowledgement is deliberately separate from approval to release funds. */
export async function approveUsableWebOrder(customerId: string, invoice: string) {
  return prisma.$transaction(async tx => {
    const order = await tx.order.findFirst({
      where: { invoiceNumber: invoice.trim().toUpperCase(), webCustomerId: customerId, channel: "WEB" },
      select: { id: true, chatId: true },
    });
    if (!order) throw new UsabilityApprovalError("order_not_found");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`delivery-feedback:${order.id}`}))`;
    // Serialize against payment/refund transactions that update this order row.
    await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: {
      paymentStatus: true, status: true, refundedAt: true,
      items: { select: { stockItemId: true } },
      deliveryReceipts: { where: { channel: "WEB", status: "SENT" }, select: { stockItemId: true } },
    } });
    if (current.paymentStatus !== "PAID" || current.refundedAt || ["CANCELLED", "REFUNDED", "EXPIRED"].includes(current.status)) throw new UsabilityApprovalError("order_not_eligible");
    const delivered = new Set(current.deliveryReceipts.map(receipt => receipt.stockItemId));
    if (!current.items.length || current.items.some(item => !item.stockItemId || !delivered.has(item.stockItemId))) throw new UsabilityApprovalError("delivery_incomplete");
    const missing = await tx.telegramNotification.findUnique({ where: { dedupeKey: `delivery-missing-report:${order.id}` }, select: { status: true } });
    if (missing?.status === "MANUAL_REVIEW") throw new UsabilityApprovalError("delivery_under_review");
    const dedupeKey = `product-usability-approved:${order.id}`;
    if (await tx.telegramNotification.findUnique({ where: { dedupeKey }, select: { id: true } })) return { approved: true };
    await releaseSellerEarningsAfterApproval(tx, order.id, `buyer:${customerId}`);
    await tx.telegramNotification.create({ data: {
      dedupeKey, orderId: order.id, chatId: order.chatId, kind: "PRODUCT_USABILITY_APPROVED",
      messageText: "Pembeli mengonfirmasi seluruh produk bisa digunakan.", status: "SENT", sentAt: new Date(),
    } });
    return { approved: true };
  });
}
