import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { canPermanentlyDeleteStock } from "@/server/stock/admin-actions";
import { resolveProductAdminReturnTo } from "@/server/products/admin-navigation";
import { adminResultReturnPath } from "@/server/admin/return-path";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let destination = "/admin/products";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    destination = resolveProductAdminReturnTo(form.get("returnTo"), id);
    await prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, id);
      const product = await tx.product.findUniqueOrThrow({
        where: { id },
        select: {
          _count: { select: { orderItems: true } },
          stockItems: {
            select: {
              id: true,
              status: true,
              reservedOrderId: true,
              deliveredOrderId: true,
              orderItem: { select: { id: true } },
              deliveryReceipt: { select: { id: true } },
            },
          },
        },
      });
      if (product._count.orderItems > 0) {
        throw new Error("Product with order history cannot be deleted");
      }
      if (product.stockItems.some((item) => !canPermanentlyDeleteStock({
        status: item.status,
        reservedOrderId: item.reservedOrderId,
        deliveredOrderId: item.deliveredOrderId,
        hasOrderItem: Boolean(item.orderItem),
        hasDeliveryReceipt: Boolean(item.deliveryReceipt),
      }))) {
        throw new Error("Product still has protected stock");
      }
      await tx.telegramNotification.deleteMany({ where: { productId: id } });
      await tx.digitalStockItem.deleteMany({ where: { productId: id } });
      await tx.product.delete({ where: { id } });
    });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(destination, "notice", "product-deleted")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(destination, "error", "product-delete")),
      303,
    );
  }
}
