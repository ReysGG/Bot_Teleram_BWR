import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { appRoute } from "@/server/env";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const { id } = await context.params;
    const product = await prisma.product.findUniqueOrThrow({ where: { id } });
    await prisma.product.update({
      where: { id },
      data: { status: product.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" },
    });
    return NextResponse.redirect(
      appRoute("/admin/products?notice=product-updated"),
      303,
    );
  } catch {
    return NextResponse.redirect(appRoute("/admin/products?error=product"), 303);
  }
}
