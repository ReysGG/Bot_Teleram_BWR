import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { qrisAdminErrorCode } from "@/server/payment/qris-admin-route";
import { setLegacyQrisFallbackEnabled } from "@/server/payment/qris-legacy-service";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    await setLegacyQrisFallbackEnabled({ enabled: true, actor: `admin:${admin.email}` });
    return NextResponse.redirect(appRoute("/admin/payment-settings/qris?notice=legacy_qris_selected"), 303);
  } catch (error) {
    return NextResponse.redirect(appRoute(`/admin/payment-settings/qris?error=${qrisAdminErrorCode(error)}`), 303);
  }
}
