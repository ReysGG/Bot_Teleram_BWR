import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { verifyUsdtBep20Attempt } from "@/server/payment/usdt-bep20";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { adminResultReturnPath } from "@/server/admin/return-path";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/payments/usdt-bep20#usdt-bep20-ledger";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const { id } = await context.params;
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? returnTo);
    await verifyUsdtBep20Attempt({ attemptId: id });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "usdt_bep20_rechecked")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "usdt_bep20_recheck")),
      303,
    );
  }
}
