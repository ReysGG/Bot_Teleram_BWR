import type { NextRequest } from "next/server";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { revokeBinanceWebSession } from "@/server/payment/binance-web-session";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const { id } = await context.params;
    await revokeBinanceWebSession(id, `admin:${admin.email}`);
    return adminFormSuccess(
      request,
      "/admin/payment-settings/binance-web?notice=session-revoked",
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, "/admin/payment-settings/binance-web?error=admin-session", "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, "/admin/payment-settings/binance-web?error=admin-origin", "admin-origin", 403);
    }
    return adminFormFailure(request, "/admin/payment-settings/binance-web?error=session-revoke", "session-revoke", 422);
  }
}
