import { NextRequest, NextResponse } from "next/server";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { transitionSellerWithdrawal } from "@/server/seller/admin-finance";
import { isPayoutAction } from "@/lib/seller-withdrawal-policy";

const domainErrors = new Set(["withdrawal_not_found", "withdrawal_state_changed", "withdrawal_reason_required", "transfer_reference_required", "withdrawal_balance_mismatch", "payout_account_not_ready", "invalid_action"]);
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = `/admin/sellers/withdrawals/${encodeURIComponent(id)}`;
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const action = String(form.get("action"));
    const version = Number(form.get("version"));
    if (!isPayoutAction(action) || !Number.isSafeInteger(version) || version < 1) throw new Error("invalid_action");
    await transitionSellerWithdrawal({ id, actor: admin.email, action, version, reference: String(form.get("reference") ?? ""), reason: String(form.get("reason") ?? "") });
    return NextResponse.redirect(new URL(`${detail}?notice=updated`, request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "UNAUTHORIZED" || message === "INVALID_ORIGIN") return NextResponse.json({ ok: false, code: "access_denied" }, { status: 403 });
    const code = domainErrors.has(message) ? message : error && typeof error === "object" && "code" in error && error.code === "P2002" ? "transfer_reference_used" : "withdrawal_action_failed";
    return NextResponse.redirect(new URL(`${detail}?error=${encodeURIComponent(code)}`, request.url), 303);
  }
}
