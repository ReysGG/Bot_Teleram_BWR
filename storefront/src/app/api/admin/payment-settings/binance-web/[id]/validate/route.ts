import type { NextRequest } from "next/server";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { prepareBinanceWebSessionValidation } from "@/server/payment/binance-web-session";
import { pollBinanceWebSessions } from "@/server/payment/binance-web-worker";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const { id } = await context.params;
    await prepareBinanceWebSessionValidation({
      id,
      actor: `admin:${admin.email}`,
    });
    const result = await pollBinanceWebSessions({ sessionId: id, maxPages: 2 });
    const failure =
      (result.unauthorized > 0 && "session-auth") ||
      (result.challenged > 0 && "session-challenge") ||
      (result.rateLimited > 0 && "session-rate-limit") ||
      (result.accountMismatch > 0 && "session-account") ||
      (result.identityUnproven > 0 && "session-identity") ||
      (result.contractUnknown > 0 && "session-contract") ||
      (result.errors > 0 && "session-validate");
    if (failure) {
      return adminFormFailure(
        request,
        `/admin/payment-settings/binance-web?error=${failure}`,
        failure,
        422,
      );
    }
    return adminFormSuccess(
      request,
      "/admin/payment-settings/binance-web?notice=session-validated",
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, "/admin/payment-settings/binance-web?error=admin-session", "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, "/admin/payment-settings/binance-web?error=admin-origin", "admin-origin", 403);
    }
    return adminFormFailure(request, "/admin/payment-settings/binance-web?error=session-validate", "session-validate", 422);
  }
}
