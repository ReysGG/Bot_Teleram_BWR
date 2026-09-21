import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { authenticateStorefrontJsonRequest, storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { ClerkCommerceError, requireClerkCustomer } from "@/server/storefront/clerk-identity";
import { publicWebSmsOrder, webSmsCatalog, webSmsEnabled, webSmsFailure, webSmsOrders } from "@/server/storefront/sms";
import { purchaseSmsPoolForWebCustomer } from "@/server/smspool/customer-orders";
const headers = { "cache-control": "private, no-store" };
const purchase = z.object({ serviceId: z.number().int().positive(), countryId: z.number().int().positive(), expectedPrice: z.number().int().positive().max(2_000_000_000), idempotencyKey: z.string().uuid() }).strict();
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const code = error instanceof ClerkCommerceError ? error.code : error instanceof z.ZodError ? "invalid_input" : webSmsFailure(error);
  return NextResponse.json({ ok: false, code }, { status: error instanceof ClerkCommerceError ? code === "account_setup_required" ? 409 : 401 : code === "sms_unavailable" ? 503 : 422, headers });
}
export async function GET(request: NextRequest) {
  const signed = authenticateStorefrontRequest(request);
  if (!signed.ok) return storefrontAuthenticationResponse(signed);
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    if (request.nextUrl.searchParams.get("view") === "orders") {
      const cursor = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/).optional().parse(request.nextUrl.searchParams.get("cursor") || undefined);
      return NextResponse.json({ ok: true, ...await webSmsOrders(customer.id, cursor) }, { headers });
    }
    if (!webSmsEnabled()) return NextResponse.json({ ok: false, code: "sms_disabled" }, { status: 503, headers });
    const rawService = request.nextUrl.searchParams.get("serviceId");
    const serviceId = rawService ? z.coerce.number().int().positive().parse(rawService) : undefined;
    return NextResponse.json({ ok: true, ...await webSmsCatalog(customer.id, serviceId) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    if (!webSmsEnabled()) return NextResponse.json({ ok: false, code: "sms_disabled" }, { status: 503, headers });
    const input = purchase.parse(signed.body);
    const order = await purchaseSmsPoolForWebCustomer({ ...input, customerId: customer.id });
    return NextResponse.json({ ok: true, order: publicWebSmsOrder(order) }, { headers });
  } catch (error) { return failure(error); }
}
