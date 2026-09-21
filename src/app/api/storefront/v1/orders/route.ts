import { NextResponse, type NextRequest } from "next/server";
import {
  requireWebCustomerSession,
  WebCustomerAccessError,
} from "@/server/storefront/customer-access";
import {
  authenticateStorefrontRequest,
} from "@/server/storefront/auth";
import {
  storefrontAuthenticationResponse,
  storefrontBearerToken,
} from "@/server/storefront/http";
import { listWebCustomerOrders, pageWebCustomerOrders, webCustomerWalletBalance } from "@/server/storefront/orders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  try {
    const session = await requireWebCustomerSession(storefrontBearerToken(request));
    const query = request.nextUrl.searchParams;
    const page = query.has("page") ? await pageWebCustomerOrders(session.webCustomerId, { page: query.get("page") ?? "1", q: query.get("q") ?? "", status: query.get("status") ?? "all" }) : null;
    return NextResponse.json(
      {
        ok: true,
        customer: {
          contactMasked: session.webCustomer.contactMasked,
          walletBalance: await webCustomerWalletBalance(session.webCustomerId),
        },
        orders: page?.orders ?? await listWebCustomerOrders(session.webCustomerId),
        ...(page ? { pagination: page.pagination } : {}),
      },
      { headers: { "cache-control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, code: error instanceof WebCustomerAccessError ? "session_invalid" : "orders_unavailable" },
      { status: error instanceof WebCustomerAccessError ? 401 : 503, headers: { "cache-control": "private, no-store" } },
    );
  }
}
