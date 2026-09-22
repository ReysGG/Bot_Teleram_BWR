import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const { id } = await context.params;
    await prisma.$transaction(async (tx) => {
      const group = await tx.productGroup.findUniqueOrThrow({
        where: { id },
        select: { _count: { select: { products: true } } },
      });
      if (group._count.products > 0) throw new Error("Product group is in use");
      await tx.productGroup.delete({ where: { id } });
    });
    return NextResponse.redirect(appRoute("/admin/product-groups?notice=group-deleted"), 303);
  } catch (error) {
    const inUse = error instanceof Error && error.message === "Product group is in use";
    return NextResponse.redirect(appRoute(`/admin/product-groups?error=${inUse ? "in-use" : "group-delete"}`), 303);
  }
}
