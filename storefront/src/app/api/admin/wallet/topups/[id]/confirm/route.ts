import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import {
  AdminManualPaymentError,
  approveWalletTopupManually,
} from "@/server/payment/admin-manual-approval";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { cleanError } from "@/server/utils/format";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin/wallet#topup-history";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const { id } = await context.params;
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? returnTo);
    await approveWalletTopupManually({
      walletTopupId: id,
      adminEmail: admin.email,
    });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "topup-confirmed")),
      303,
    );
  } catch (error) {
    const code = error instanceof AdminManualPaymentError
      ? error.code
      : "topup";
    console.warn("[Admin manual wallet top up]", cleanError(error));
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", code)),
      303,
    );
  }
}
