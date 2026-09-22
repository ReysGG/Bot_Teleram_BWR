import { NextResponse, type NextRequest } from "next/server";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { permanentlyDeleteStockItem } from "@/server/stock/admin-actions";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/inventory/available";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(
      String(form.get("returnTo") ?? ""),
      returnTo,
    );
    const { id } = await context.params;
    await permanentlyDeleteStockItem(id);
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "deleted")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "stock-action")),
      303,
    );
  }
}
