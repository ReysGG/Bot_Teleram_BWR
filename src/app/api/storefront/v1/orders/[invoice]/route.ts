import { NextResponse, type NextRequest } from "next/server";
import {
  requireWebCustomerSession,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import {
  storefrontAuthenticationResponse,
  storefrontBearerToken,
} from "@/server/storefront/http";
import { getWebCustomerOrder } from "@/server/storefront/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ invoice: string }> },
) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const { invoice } = await params;
    const order = await getWebCustomerOrder(session.webCustomerId, invoice);
    if (!order) {
      return NextResponse.json(
        { ok: false, code: "order_not_found" },
        { status: 404, headers: { "cache-control": "private, no-store" } },
      );
    }
    return NextResponse.json(
      { ok: true, order },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "order_unavailable" },
      { status: error instanceof WebCustomerAccessError ? 401 : 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
