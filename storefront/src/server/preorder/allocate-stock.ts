import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { sellableStockWhere } from "@/server/stock/sellable";
import { queueOrderDigitalDelivery } from "@/server/orders/delivery-channel";
import { assignOrderItemsToStock } from "@/server/orders/stock-assignment";

function sellableHealthFilter() {
  return sellableStockWhere();
}

export async function allocatePaidPreorders(
  productId: string,
  limit = 100,
): Promise<number> {
  const allocationLimit = Math.min(Math.max(limit, 1), 100);

  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx, productId);
    let allocated = 0;

    while (allocated < allocationLimit) {
      const order = await tx.order.findFirst({
        where: {
          isPreorder: true,
          status: "PAID_WAITING_STOCK",
          paymentStatus: "PAID",
          items: { some: { productId, stockItemId: null } },
        },
        orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
        include: { items: { orderBy: { createdAt: "asc" } } },
      });
      if (!order) break;
      const missingItems = order.items.filter(
        (item) => item.productId === productId && !item.stockItemId,
      );
      if (missingItems.length === 0) break;

      const stockItems = await tx.digitalStockItem.findMany({
        where: {
          productId,
          archivedAt: null,
          status: "AVAILABLE",
          ...sellableHealthFilter(),
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
        take: missingItems.length,
      });
      if (stockItems.length < missingItems.length) break;

      const now = new Date();
      const stockClaim = await tx.digitalStockItem.updateMany({
        where: {
          id: { in: stockItems.map((stock) => stock.id) },
          archivedAt: null,
          status: "AVAILABLE",
          ...sellableHealthFilter(),
        },
        data: {
          status: "RESERVED",
          reservedOrderId: order.id,
          reservedAt: now,
        },
      });
      if (stockClaim.count !== missingItems.length) {
        throw new Error("Preorder allocation changed concurrently");
      }
      const itemClaimCount = await assignOrderItemsToStock(
        tx,
        missingItems.map((orderItem, index) => ({
          orderItemId: orderItem.id,
          stockItemId: stockItems[index].id,
        })),
      );
      if (itemClaimCount !== missingItems.length) {
        throw new Error("Preorder allocation changed concurrently");
      }
      const orderClaim = await tx.order.updateMany({
        where: {
          id: order.id,
          status: "PAID_WAITING_STOCK",
          paymentStatus: "PAID",
        },
        data: { status: "FULFILLING" },
      });

      if (orderClaim.count !== 1) {
        throw new Error("Preorder allocation changed concurrently");
      }

      const assignedStockIds = [
        ...order.items.flatMap((item) => (item.stockItemId ? [item.stockItemId] : [])),
        ...stockItems.map((stock) => stock.id),
      ];
      await queueOrderDigitalDelivery(tx, {
        orderId: order.id,
        chatId: order.chatId,
        channel: order.channel,
        stockItemIds: assignedStockIds,
      });
      allocated += 1;
    }

    return allocated;
  });
}

export async function allocateAllPaidPreorders(limit = 25): Promise<number> {
  const allocationLimit = Math.min(Math.max(limit, 1), 100);
  const queuedProducts = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      stockItemId: null,
      order: {
        isPreorder: true,
        status: "PAID_WAITING_STOCK",
        paymentStatus: "PAID",
      },
    },
    orderBy: { productId: "asc" },
    take: allocationLimit,
  });

  let allocated = 0;
  for (const { productId } of queuedProducts) {
    if (allocated >= allocationLimit) break;
    allocated += await allocatePaidPreorders(productId, allocationLimit - allocated);
  }
  return allocated;
}
