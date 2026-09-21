import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { authenticateStorefrontJsonRequest, storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { ClerkCommerceError, requireClerkCustomer } from "@/server/storefront/clerk-identity";
import { publicWebSmsOrder, requireWebSmsOrder, webSmsFailure } from "@/server/storefront/sms";
import { cancelSmsPoolCustomerOrder, refreshSmsPoolCustomerOrder } from "@/server/smspool/customer-orders";
const headers = { "cache-control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function failure(error: unknown) {
  const code = error instanceof ClerkCommerceError ? error.code : error instanceof z.ZodError ? "invalid_input" : webSmsFailure(error);
  return NextResponse.json({ ok: false, code }, { status: error instanceof ClerkCommerceError ? 401 : code === "sms_order_missing" ? 404 : code === "sms_unavailable" ? 503 : 422, headers });
}
export async function GET(request: NextRequest, context: Context) {
  const signed = authenticateStorefrontRequest(request);
  if (!signed.ok) return storefrontAuthenticationResponse(signed);
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    return NextResponse.json({ ok: true, order: publicWebSmsOrder(await requireWebSmsOrder(customer.id, (await context.params).id)) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest, context: Context) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    const action = z.object({ action: z.enum(["refresh", "cancel"]) }).strict().parse(signed.body).action;
    const owned = await requireWebSmsOrder(customer.id, (await context.params).id);
    const result = action === "cancel" ? await cancelSmsPoolCustomerOrder(owned.chatId, owned.id) : await refreshSmsPoolCustomerOrder(owned.chatId, owned.id);
    return NextResponse.json({ ok: true, order: publicWebSmsOrder(result ?? owned) }, { headers });
  } catch (error) { return failure(error); }
}
