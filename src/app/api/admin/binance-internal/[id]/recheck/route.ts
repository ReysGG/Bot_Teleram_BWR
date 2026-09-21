import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { verifyBinanceInternalAttempt } from "@/server/payment/binance-internal";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { adminResultReturnPath } from "@/server/admin/return-path";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/payments/binance#binance-internal-ledger";
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const { id } = await context.params;
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? returnTo);
    await verifyBinanceInternalAttempt({ attemptId: id });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "binance_internal_rechecked")),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", "binance_internal_recheck")),
      303,
    );
  }
}
