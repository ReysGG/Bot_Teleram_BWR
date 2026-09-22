import { NextResponse, type NextRequest } from "next/server";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { checkStockItem } from "@/server/stock/health-check";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/inventory/available";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(
      String(form.get("returnTo") ?? ""),
      returnTo,
    );

    const { id } = await context.params;
    if (!consumeRateLimit(`stock-check:${admin.email}:${id}`, 8, 60_000)) {
      return NextResponse.redirect(
        appRoute(adminResultReturnPath(returnTo, "error", "check-rate")),
        303,
      );
    }

    const result = await checkStockItem(id);
    await allocatePaidPreorders(result.productId);
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(
        returnTo,
        "notice",
        `checked-${result.classification.toLowerCase()}`,
      )),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "stock-check")),
      303,
    );
  }
}
