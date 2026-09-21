import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { requireWebCustomerSession, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { webRedeem, WebRedeemError } from "@/server/storefront/web-redeem";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
async function handle(request: NextRequest, context: { params: Promise<{ invoice: string }> }, download: boolean) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await context.params;
    const result = await webRedeem({ customerId: session.webCustomerId, invoiceNumber: invoice, download });
    if (!result.content) return NextResponse.json({ ok: true, ...result.summary }, { headers });
    return new NextResponse(new Uint8Array(result.content), { headers: {
      ...headers, "content-type": "text/plain; charset=utf-8",
      "content-disposition": 'attachment; filename="BWR-Codex-login.txt"',
    } });
  } catch (error) {
    const status = error instanceof WebCustomerAccessError ? 401 : error instanceof WebRedeemError ? (error.code === "order_not_found" ? 404 : 409) : 503;
    return NextResponse.json({ ok: false, code: error instanceof WebRedeemError ? error.code : status === 401 ? "session_invalid" : "login_unavailable" }, { status, headers });
  }
}
export const GET = (request: NextRequest, context: { params: Promise<{ invoice: string }> }) => handle(request, context, false);
export const POST = (request: NextRequest, context: { params: Promise<{ invoice: string }> }) => handle(request, context, true);
