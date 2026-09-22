import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { creditExpiredOrderPaymentToWallet } from "@/server/wallet/expired-order-credit";
import { adminResultReturnPath } from "@/server/admin/return-path";
import { cleanError } from "@/server/utils/format";

export const runtime = "nodejs";

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
    const result = await creditExpiredOrderPaymentToWallet({
      orderId: id,
      adminEmail: admin.email,
    });
    const notice = result.credited
      ? "expired-payment-credited"
      : "expired-payment-already-credited";
    return NextResponse.redirect(
      appRoute(adminResultReturnPath(returnTo, "notice", notice)),
      303,
    );
  } catch (error) {
    console.warn("[Admin expired payment credit]", cleanError(error));
    return NextResponse.redirect(
      appRoute(
        adminResultReturnPath(
          returnTo,
          "error",
          "expired-payment-credit",
        ),
      ),
      303,
    );
  }
}
