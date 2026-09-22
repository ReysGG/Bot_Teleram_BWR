import { NextResponse, type NextRequest } from "next/server";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { restoreStockItem } from "@/server/stock/admin-actions";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/inventory/archived";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(
      String(form.get("returnTo") ?? ""),
      returnTo,
    );
    const { id } = await context.params;
    const restored = await restoreStockItem(id);
    await allocatePaidPreorders(restored.productId);
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "restored")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "stock-action")),
      303,
    );
  }
}
