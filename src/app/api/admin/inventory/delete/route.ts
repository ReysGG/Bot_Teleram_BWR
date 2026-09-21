import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { permanentlyDeleteStockItems } from "@/server/stock/admin-actions";

export async function POST(request: NextRequest) {
  let returnTo = "/admin/inventory/available";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(String(form.get("returnTo") ?? ""), returnTo);
    const stockItemIds = z.array(z.string().min(1)).min(1).max(100).parse(
      form.getAll("stockItemIds"),
    );
    const result = await permanentlyDeleteStockItems(stockItemIds);
    if (result.deleted === 0) throw new Error("No deletable stock selected");
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
