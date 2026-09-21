import { NextResponse, type NextRequest } from "next/server";
import { BannedStockPolicy } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const rawPolicy = String(form.get("bannedStockPolicy") ?? "");
    if (!Object.values(BannedStockPolicy).includes(rawPolicy as BannedStockPolicy)) {
      throw new Error("Invalid banned stock policy");
    }
    const policy = rawPolicy as BannedStockPolicy;
    await prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, id);
      await tx.product.update({ where: { id }, data: { bannedStockPolicy: policy } });

      const unallocatedBannedStock = {
        productId: id,
        archivedAt: null,
        healthStatus: "BANNED" as const,
        status: { in: ["AVAILABLE" as const, "BANNED" as const] },
        reservedOrderId: null,
        deliveredOrderId: null,
      };
      if (policy === BannedStockPolicy.OWNER_APPROVAL) {
        await tx.digitalStockItem.updateMany({
          where: {
            ...unallocatedBannedStock,
            bannedSaleApprovedAt: null,
          },
          data: { status: "BANNED" },
        });
        await tx.digitalStockItem.updateMany({
          where: {
            ...unallocatedBannedStock,
            bannedSaleApprovedAt: { not: null },
          },
          data: { status: "AVAILABLE" },
        });
      } else {
        await tx.digitalStockItem.updateMany({
          where: unallocatedBannedStock,
          data: {
            status: "BANNED",
            bannedSaleApprovedAt: null,
            bannedSaleApprovedBy: null,
            bannedSaleApprovalNote: null,
          },
        });
        if (policy === BannedStockPolicy.ALLOW_HTTP_401) {
          await tx.digitalStockItem.updateMany({
            where: {
              ...unallocatedBannedStock,
              healthHttpStatus: 401,
            },
            data: { status: "AVAILABLE" },
          });
        }
      }
    });
    const allocated = await allocatePaidPreorders(id);
    const query = new URLSearchParams({
      notice: "banned-policy-updated",
      allocated: String(allocated),
    });
    return NextResponse.redirect(
      appRoute(`/admin/products/${id}/edit?${query}`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(`/admin/products/${id}/edit?error=banned-policy`),
      303,
    );
  }
}
