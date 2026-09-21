import { booleanEnv } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { isSellableStock, sellableStockWhere } from "@/server/stock/sellable";
import { queueOrderDigitalDelivery } from "@/server/orders/delivery-channel";

export function stockMatchesOrderProduct(
  stockProductId: string,
  orderProductId: string,
): boolean {
  return stockProductId === orderProductId;
}

export async function assignStockToPaidPreorder(input: {
  orderId: string;
  stockItemId: string;
}) {
  const stockProduct = await prisma.digitalStockItem.findUnique({
    where: { id: input.stockItemId },
    select: { productId: true },
  });
  if (!stockProduct) throw new Error("File stok tidak ditemukan");

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, stockProduct.productId);
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true, items: true },
    });
    if (!order || !order.payment) throw new Error("Order preorder tidak ditemukan");
    if (
      !order.isPreorder ||
      order.status !== "PAID_WAITING_STOCK" ||
      order.paymentStatus !== "PAID" ||
      order.payment.status !== "PAID"
    ) {
      throw new Error("Order tidak sedang menunggu stok setelah pembayaran");
    }
    const orderItem = order.items.find((item) => !item.stockItemId);
    if (!orderItem) {
      throw new Error("Semua unit order sudah memiliki stok");
    }

    const stock = await tx.digitalStockItem.findUnique({
      where: { id: input.stockItemId },
      include: { product: { select: { bannedStockPolicy: true } } },
    });
    if (!stock || !stockMatchesOrderProduct(stock.productId, orderItem.productId)) {
      throw new Error("File stok tidak cocok dengan produk order");
    }
    const requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true);
    const healthAllowed = isSellableStock({
      healthStatus: stock.healthStatus,
      healthHttpStatus: stock.healthHttpStatus,
      bannedSaleApprovedAt: stock.bannedSaleApprovedAt,
      bannedStockPolicy: stock.product.bannedStockPolicy,
      requireHealthy,
    });
    if (
      stock.status !== "AVAILABLE" ||
      stock.archivedAt ||
      !healthAllowed
    ) {
      throw new Error("File stok tidak aktif atau tidak sehat");
    }

    const now = new Date();
    const stockClaim = await tx.digitalStockItem.updateMany({
      where: {
        id: stock.id,
        status: "AVAILABLE",
        archivedAt: null,
        ...sellableStockWhere(requireHealthy),
      },
      data: {
        status: "RESERVED",
        reservedOrderId: order.id,
        reservedAt: now,
      },
    });
    const itemClaim = await tx.orderItem.updateMany({
      where: { id: orderItem.id, stockItemId: null },
      data: { stockItemId: stock.id },
    });
    if (stockClaim.count !== 1 || itemClaim.count !== 1) {
      throw new Error("Order atau stok berubah saat dialokasikan");
    }

    const remaining = order.items.filter(
      (item) => item.id !== orderItem.id && !item.stockItemId,
    ).length;
    if (remaining === 0) {
      const orderClaim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "PAID_WAITING_STOCK",
          paymentStatus: "PAID",
        },
        data: { status: "FULFILLING" },
      });
      if (orderClaim.count !== 1) {
        throw new Error("Order berubah saat alokasi stok diselesaikan");
      }
      const stockItemIds = [
        ...order.items.flatMap((item) => (item.stockItemId ? [item.stockItemId] : [])),
        stock.id,
      ];
      await queueOrderDigitalDelivery(tx, {
        orderId: order.id,
        chatId: order.chatId,
        channel: order.channel,
        stockItemIds,
      });
    }
    return { orderId: order.id, stockItemId: stock.id, remaining };
  });
}
