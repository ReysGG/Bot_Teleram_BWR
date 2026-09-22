import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import {
  qrisAdminErrorCode,
  qrisAdminReturnPath,
} from "@/server/payment/qris-admin-route";
import { archiveQrisMerchant } from "@/server/payment/qris-merchant-service";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let returnTo = `/admin/payment-settings/qris/${encodeURIComponent(id)}`;
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    returnTo = qrisAdminReturnPath(id, form.get("returnTo"));
    await archiveQrisMerchant({ id, actor: `admin:${admin.email}` });
    return NextResponse.redirect(appRoute(`${returnTo}?notice=qris_archived`), 303);
  } catch (error) {
    return NextResponse.redirect(
      appRoute(`${returnTo}?error=${qrisAdminErrorCode(error)}`),
      303,
    );
  }
}
