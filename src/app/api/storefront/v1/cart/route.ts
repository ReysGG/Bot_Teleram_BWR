import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { authenticateStorefrontJsonRequest, storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { ClerkCommerceError, requireClerkCustomer } from "@/server/storefront/clerk-identity";
import { mutateWebCart, readWebCart } from "@/server/storefront/cart";
import { WebCartError, webCartCommandSchema } from "@/server/storefront/cart-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };
function failure(error: unknown) {
  const code = error instanceof ClerkCommerceError || error instanceof WebCartError ? error.code : "cart_unavailable";
  const status = error instanceof WebCartError ? 409 : code === "account_unavailable" || code === "cart_unavailable" ? 503 : code === "account_setup_required" ? 409 : 401;
  return NextResponse.json({ ok: false, code }, { status, headers });
}
export async function GET(request: NextRequest) {
  const signed = authenticateStorefrontRequest(request);
  if (!signed.ok) return storefrontAuthenticationResponse(signed);
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    return NextResponse.json({ ok: true, cart: await readWebCart(customer.id) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  const parsed = webCartCommandSchema.safeParse(signed.body);
  if (!parsed.success) return NextResponse.json({ ok: false, code: "invalid_cart_command" }, { status: 422, headers });
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    return NextResponse.json({ ok: true, cart: await mutateWebCart(customer.id, parsed.data) }, { headers });
  } catch (error) { return failure(error); }
}
