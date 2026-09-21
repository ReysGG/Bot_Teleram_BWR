import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { normalizeInventoryReturnUrl } from "@/server/admin/inventory";
import {
  adminResultReturnPath,
  buildAdminReturnPath,
} from "@/server/admin/return-path";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { setBannedStockSaleApproval } from "@/server/stock/banned-recovery";
import { cleanError } from "@/server/utils/format";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/inventory/banned-recovery#inventory-ledger";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    returnTo = normalizeInventoryReturnUrl(
      String(form.get("returnTo") ?? ""),
      returnTo,
    );
    const action = String(form.get("action") ?? "");
    if (action !== "approve" && action !== "revoke") {
      throw new Error("Invalid banned sale action");
    }
    const { id } = await context.params;
    const result = await setBannedStockSaleApproval({
      stockItemId: id,
      approved: action === "approve",
      actor: admin.email,
      note: String(form.get("note") ?? ""),
    });
    const allocated = result.approved
      ? await allocatePaidPreorders(result.productId)
      : 0;
    const resultPath = adminResultReturnPath(
      returnTo,
      "notice",
      result.approved ? "banned-sale-approved" : "banned-sale-revoked",
    );
    return NextResponse.redirect(
      appRoute(buildAdminReturnPath({
        pathname: resultPath,
        query: { allocated: String(allocated) },
        fragment: "inventory-ledger",
      })),
      303,
    );
  } catch (error) {
    console.warn("[Admin banned stock sale]", cleanError(error));
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "banned-sale")),
      303,
    );
  }
}
