import { NextResponse, type NextRequest } from "next/server";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { appRoute } from "@/server/env";
import {
  AdminManualPaymentError,
  approveOrderPaymentManually,
} from "@/server/payment/admin-manual-approval";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { cleanError } from "@/server/utils/format";
import { ManualCryptoApprovalError } from "@/server/payment/manual-crypto-policy";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  let returnTo = "/admin?sheet=orders#recent-orders";
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const { id } = await context.params;
    const form = await request.formData();
    returnTo = String(form.get("returnTo") ?? returnTo);
    await approveOrderPaymentManually({
      orderId: id,
      adminEmail: admin.email,
      ...(form.has("reference") || form.has("reason") ? { manualCryptoApproval: {
        reference: String(form.get("reference") ?? ""), reason: String(form.get("reason") ?? ""),
      } } : {}),
    });
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", "payment-confirmed")),
      303,
    );
  } catch (error) {
    const code = error instanceof AdminManualPaymentError || error instanceof ManualCryptoApprovalError
      ? error.code
      : "payment";
    console.warn("[Admin manual order payment]", cleanError(error));
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "error", code)),
      303,
    );
  }
}
