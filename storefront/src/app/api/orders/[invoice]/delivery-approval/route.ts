import { NextRequest, NextResponse } from "next/server";
import { commerceAccessToken } from "@/lib/commerce-auth";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";
import { requireWebCustomerSession, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { approveUsableWebOrder, UsabilityApprovalError } from "@/server/seller/usability-approval";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  if (!storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  try {
    const token = await commerceAccessToken(request.headers.get("authorization"));
    const session = await requireWebCustomerSession(token);
    const { invoice } = await params;
    await approveUsableWebOrder(session.webCustomerId, invoice);
    return NextResponse.json({ ok: true, approved: true }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof WebCustomerAccessError ? "session_invalid" : error instanceof UsabilityApprovalError ? error.message : "approval_unavailable";
    return NextResponse.json({ ok: false, code }, { status: code === "session_invalid" ? 401 : code === "order_not_found" ? 404 : code === "approval_unavailable" ? 503 : 409 });
  }
}
