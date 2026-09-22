import { prisma } from "@/server/db/prisma";
import { ratingEligibility, ratingInput } from "./policy";

export async function submitRating(customerId: string, raw: unknown) {
  const input = ratingInput.parse(raw);
  return prisma.$transaction(async tx => {
    const item = await tx.orderItem.findFirst({
      where: { id: input.orderItemId, order: { webCustomerId: customerId } },
      include: { order: { include: {
        deliveryReceipts: { select: { stockItemId: true, status: true, downloadCount: true } },
        walletTransactions: { where: { type: "DELIVERY_REFUND" }, select: { id: true }, take: 1 },
      } } },
    });
    if (!item) throw new Error("rating_order_missing");
    // Serializes review submissions for the same order; duplicate requests update
    // the existing review and cannot inflate the aggregate count.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rating:${item.orderId}`}))`;
    const receipt = item.order.deliveryReceipts.find(r => r.stockItemId === item.stockItemId);
    const reason = ratingEligibility({ customerId, ownerId: item.order.webCustomerId,
      orderStatus: item.order.status, paymentStatus: item.order.paymentStatus,
      refunded: !!item.order.refundedAt, hasRefund: item.order.walletTransactions.length > 0,
      channel: item.order.channel, receiptStatus: receipt?.status ?? null, downloadCount: receipt?.downloadCount ?? 0 });
    if (reason) throw new Error(reason);
    const data = { stars: input.stars, review: input.review || null };
    if (input.kind === "product") {
      return tx.productRating.upsert({
        where: { orderId_productId: { orderId: item.orderId, productId: item.productId } },
        create: { ...data, customerId, productId: item.productId, orderId: item.orderId, orderItemId: item.id },
        update: data, select: { id: true, stars: true },
      });
    }
    // Never infer historical ownership from today's Product.sellerId.
    if (!item.sellerIdSnapshot) throw new Error("rating_seller_missing");
    const owner = await tx.webCustomer.findUniqueOrThrow({ where: { id: customerId }, select: { clerkIssuer: true, clerkUserId: true } });
    if (owner.clerkIssuer && owner.clerkUserId && await tx.sellerMembership.findFirst({ where: { sellerId: item.sellerIdSnapshot, clerkIssuer: owner.clerkIssuer, clerkUserId: owner.clerkUserId } })) throw new Error("rating_self_review");
    return tx.sellerRating.upsert({
      where: { orderId: item.orderId },
      create: { ...data, orderId: item.orderId, customerId, sellerId: item.sellerIdSnapshot },
      update: data, select: { id: true, stars: true },
    });
  });
}

export async function productRatingSummary(productId: string) {
  const summary = await prisma.productRating.aggregate({ where: { productId }, _avg: { stars: true }, _count: { stars: true } });
  return { average: summary._avg.stars, count: summary._count.stars };
}

export async function sellerRatingSummary(sellerId: string) {
  const summary = await prisma.sellerRating.aggregate({ where: { sellerId }, _avg: { stars: true }, _count: { stars: true } });
  return { average: summary._avg.stars, count: summary._count.stars };
}
