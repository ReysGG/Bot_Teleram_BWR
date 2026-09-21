import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { requireWebCustomerSession, WebCustomerAccessError } from "@/server/storefront/customer-access";
import { storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { refreshWebPayment } from "@/server/storefront/payment-actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ invoice: string }> }) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await params;
    const order = await refreshWebPayment({ customerId: session.webCustomerId, invoiceNumber: invoice });
    return NextResponse.json({ ok: true, order }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "payment_refresh_failed" }, { status: error instanceof WebCustomerAccessError ? 401 : 409 });
  }
}
