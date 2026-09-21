import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
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
    await prisma.product.update({ where: { id }, data: { status: "INACTIVE" } });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(destination, "notice", "product-deactivated")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(destination, "error", "product-status")),
      303,
    );
  }
}
