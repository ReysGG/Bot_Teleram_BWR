import { prisma } from "@/server/db/prisma";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { canApproveBannedStockForSale } from "@/server/admin/inventory";

export async function setBannedStockSaleApproval(input: {
  stockItemId: string;
  approved: boolean;
  actor: string;
  note?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const lookup = await tx.digitalStockItem.findUnique({
      where: { id: input.stockItemId },
      select: { productId: true },
    });
    if (!lookup) throw new Error("Stock item not found");
    await lockInventoryAllocation(tx, lookup.productId);

    const item = await tx.digitalStockItem.findUnique({
      where: { id: input.stockItemId },
      include: {
        product: { select: { bannedStockPolicy: true } },
        orderItem: { select: { id: true } },
        deliveryReceipt: { select: { id: true } },
      },
    });
    if (!item) throw new Error("Stock item not found");

    if (!input.approved) {
      if (item.deliveredOrderId || item.reservedOrderId || item.orderItem || item.deliveryReceipt) {
        throw new Error("Allocated stock approval cannot be changed");
      }
      const updated = await tx.digitalStockItem.updateMany({
        where: {
          id: item.id,
          deliveredOrderId: null,
          reservedOrderId: null,
        },
        data: {
          status: "BANNED",
          bannedSaleApprovedAt: null,
          bannedSaleApprovedBy: null,
          bannedSaleApprovalNote: null,
        },
      });
      if (updated.count !== 1) throw new Error("Stock changed while revoking approval");
      return { productId: item.productId, approved: false };
    }

    if (!canApproveBannedStockForSale({
      status: item.status,
      healthStatus: item.healthStatus,
      archivedAt: item.archivedAt,
      reservedOrderId: item.reservedOrderId,
      deliveredOrderId: item.deliveredOrderId,
      hasOrderItem: Boolean(item.orderItem),
      hasDeliveryReceipt: Boolean(item.deliveryReceipt),
      productPolicy: item.product.bannedStockPolicy,
    })) {
      throw new Error("Stock is not eligible for owner-approved sale");
    }

    const updated = await tx.digitalStockItem.updateMany({
      where: {
        id: item.id,
        status: "BANNED",
        healthStatus: "BANNED",
        archivedAt: null,
        reservedOrderId: null,
        deliveredOrderId: null,
        bannedSaleApprovedAt: null,
      },
      data: {
        status: "AVAILABLE",
        bannedSaleApprovedAt: new Date(),
        bannedSaleApprovedBy: input.actor.slice(0, 200),
        bannedSaleApprovalNote: input.note?.trim().slice(0, 500) || null,
      },
    });
    if (updated.count !== 1) throw new Error("Stock changed while approving sale");
    return { productId: item.productId, approved: true };
  });
}
