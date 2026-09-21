import { NextResponse, type NextRequest } from "next/server";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { checkProductStock } from "@/server/stock/health-check";
import { appRoute } from "@/server/env";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import {
  adminResultReturnPath,
  buildAdminReturnPath,
} from "@/server/admin/return-path";
import { resolveProductAdminReturnTo } from "@/server/products/admin-navigation";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let destination = "/admin/products";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const productId = String(form.get("productId") ?? "");
    destination = resolveProductAdminReturnTo(form.get("returnTo"), productId);
    if (!consumeRateLimit(`stock-check:${admin.email}`, 5, 60_000)) {
      return NextResponse.redirect(
        appRoute(adminResultReturnPath(destination, "error", "check-rate")),
        303,
      );
    }
    if (!productId) throw new Error("Product is required");
    const result = await checkProductStock(productId, 50);
    const allocated = await allocatePaidPreorders(productId);
    const resultPath = adminResultReturnPath(
      destination,
      "notice",
      `checked-${result.checked}-${result.healthy}-${result.banned}-${result.errors}`,
    );
    return NextResponse.redirect(appRoute(buildAdminReturnPath({
      pathname: resultPath,
      query: { allocated: String(allocated) },
      fragment: destination.includes("#product-list")
        ? "product-list"
        : undefined,
    })), 303);
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(destination, "error", "stock-check")),
      303,
    );
  }
}
