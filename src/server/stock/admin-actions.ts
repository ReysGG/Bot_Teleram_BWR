import {
  BannedStockPolicy,
  DigitalStockStatus,
  StockHealthStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { isSellableStock } from "@/server/stock/sellable";

export function archiveTargetStatus(
  status: DigitalStockStatus,
): DigitalStockStatus {
  if (status === DigitalStockStatus.RESERVED) {
    throw new Error("Reserved stock cannot be archived");
  }
  return status === DigitalStockStatus.DELIVERED
    ? DigitalStockStatus.DELIVERED
    : DigitalStockStatus.DISABLED;
}

export function restoreTargetStatus(
  status: DigitalStockStatus,
  healthStatus: StockHealthStatus,
  banned?: {
    healthHttpStatus: number | null;
    bannedSaleApprovedAt: Date | null;
    bannedStockPolicy: BannedStockPolicy;
  },
): DigitalStockStatus {
  if (status === DigitalStockStatus.DELIVERED) {
    return DigitalStockStatus.DELIVERED;
  }
  if (status !== DigitalStockStatus.DISABLED) {
    throw new Error("Only disabled archived stock can be restored");
  }
  if (healthStatus !== StockHealthStatus.BANNED) {
    return DigitalStockStatus.AVAILABLE;
  }
  return banned && isSellableStock({
    healthStatus,
    healthHttpStatus: banned.healthHttpStatus,
    bannedSaleApprovedAt: banned.bannedSaleApprovedAt,
    bannedStockPolicy: banned.bannedStockPolicy,
  })
    ? DigitalStockStatus.AVAILABLE
    : DigitalStockStatus.BANNED;
}

export function canPermanentlyDeleteStock(input: {
  status: DigitalStockStatus;
  reservedOrderId: string | null;
  deliveredOrderId: string | null;
  hasOrderItem: boolean;
  hasDeliveryReceipt: boolean;
}): boolean {
  return (
    input.status !== DigitalStockStatus.RESERVED &&
    input.status !== DigitalStockStatus.DELIVERED &&
    !input.reservedOrderId &&
    !input.deliveredOrderId &&
    !input.hasOrderItem &&
    !input.hasDeliveryReceipt
  );
}

export async function archiveStockItem(stockItemId: string) {
  const item = await prisma.digitalStockItem.findUnique({
    where: { id: stockItemId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (!item) throw new Error("Stock item not found");
  if (item.archivedAt) return item;

  const status = archiveTargetStatus(item.status);
  const updated = await prisma.digitalStockItem.updateMany({
    where: { id: item.id, status: item.status, archivedAt: null },
    data: { status, archivedAt: new Date() },
  });
  if (updated.count !== 1) throw new Error("Stock item changed while archiving");
  return { ...item, status };
}

export async function restoreStockItem(stockItemId: string) {
  const item = await prisma.digitalStockItem.findUnique({
    where: { id: stockItemId },
    select: {
      id: true,
      productId: true,
      status: true,
      healthStatus: true,
      healthHttpStatus: true,
      bannedSaleApprovedAt: true,
      archivedAt: true,
      product: { select: { bannedStockPolicy: true } },
    },
  });
  if (!item) throw new Error("Stock item not found");
  if (!item.archivedAt) return item;

  const status = restoreTargetStatus(item.status, item.healthStatus, {
    healthHttpStatus: item.healthHttpStatus,
    bannedSaleApprovedAt: item.bannedSaleApprovedAt,
    bannedStockPolicy: item.product.bannedStockPolicy,
  });
  const updated = await prisma.digitalStockItem.updateMany({
    where: { id: item.id, status: item.status, archivedAt: item.archivedAt },
    data: { status, archivedAt: null },
  });
  if (updated.count !== 1) throw new Error("Stock item changed while restoring");
  return { ...item, status };
}

export async function permanentlyDeleteStockItem(stockItemId: string) {
  const item = await prisma.digitalStockItem.findUnique({
    where: { id: stockItemId },
    select: {
      id: true,
      status: true,
      reservedOrderId: true,
      deliveredOrderId: true,
      orderItem: { select: { id: true } },
      deliveryReceipt: { select: { id: true } },
    },
  });
  if (!item) return;
  if (
    !canPermanentlyDeleteStock({
      status: item.status,
      reservedOrderId: item.reservedOrderId,
      deliveredOrderId: item.deliveredOrderId,
      hasOrderItem: Boolean(item.orderItem),
      hasDeliveryReceipt: Boolean(item.deliveryReceipt),
    })
  ) {
    throw new Error("Sold, reserved, or referenced stock cannot be permanently deleted");
  }

  const deleted = await prisma.digitalStockItem.deleteMany({
    where: {
      id: item.id,
      status: item.status,
      reservedOrderId: null,
      deliveredOrderId: null,
    },
  });
  if (deleted.count !== 1) throw new Error("Stock item changed while deleting");
}

export async function permanentlyDeleteStockItems(stockItemIds: string[]) {
  const uniqueIds = [...new Set(stockItemIds)];
  return prisma.$transaction(async (tx) => {
    await lockInventoryAllocation(tx);
    const items = await tx.digitalStockItem.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        status: true,
        reservedOrderId: true,
        deliveredOrderId: true,
        orderItem: { select: { id: true } },
        deliveryReceipt: { select: { id: true } },
      },
    });
    const deletableIds = items
      .filter((item) => canPermanentlyDeleteStock({
        status: item.status,
        reservedOrderId: item.reservedOrderId,
        deliveredOrderId: item.deliveredOrderId,
        hasOrderItem: Boolean(item.orderItem),
        hasDeliveryReceipt: Boolean(item.deliveryReceipt),
      }))
      .map((item) => item.id);
    const deleted = deletableIds.length
      ? await tx.digitalStockItem.deleteMany({
          where: {
            id: { in: deletableIds },
            status: { notIn: [DigitalStockStatus.RESERVED, DigitalStockStatus.DELIVERED] },
            reservedOrderId: null,
            deliveredOrderId: null,
          },
        })
      : { count: 0 };
    return {
      deleted: deleted.count,
      skipped: uniqueIds.length - deleted.count,
    };
  });
}
