import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { appRoute } from "@/server/env";
import { parsePreorderSettings } from "@/server/products/preorder";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const { id } = await context.params;
    const form = await request.formData();
    const preorder = parsePreorderSettings(Object.fromEntries(form));
    await prisma.product.update({ where: { id }, data: preorder });
    return NextResponse.redirect(
      appRoute("/admin/products?notice=preorder-updated"),
      303,
    );
  } catch {
    return NextResponse.redirect(appRoute("/admin/products?error=preorder"), 303);
  }
}
