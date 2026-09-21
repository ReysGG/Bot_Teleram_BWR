import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { authenticateStorefrontJsonRequest, storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";
import { ClerkCommerceError, connectClerkCustomer, requireClerkCustomer } from "@/server/storefront/clerk-identity";
import { loadWebWallet } from "@/server/storefront/wallet";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const headers = { "cache-control": "private, no-store" };

function failure(error: unknown) {
  const code = error instanceof ClerkCommerceError ? error.code : "account_unavailable";
  const status = code === "account_unavailable" ? 503 : code === "account_setup_required" || code === "account_link_required" ? 409 : code === "email_verification_required" ? 422 : 401;
  return NextResponse.json({ ok: false, code }, { status, headers });
}

export async function GET(request: NextRequest) {
  const signed = authenticateStorefrontRequest(request);
  if (!signed.ok) return storefrontAuthenticationResponse(signed);
  try {
    const customer = await requireClerkCustomer(storefrontBearerToken(request) ?? "");
    const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;
    if (cursor && !/^[A-Za-z0-9_-]{1,80}$/.test(cursor)) return NextResponse.json({ ok: false, code: "invalid_cursor" }, { status: 422, headers });
    return NextResponse.json({ ok: true, customer: { contactMasked: customer.contactMasked }, wallet: await loadWebWallet(customer.id, cursor) }, { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  const signed = await authenticateStorefrontJsonRequest(request);
  if (!signed.ok) return signed.response;
  const body = signed.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "legacyPassword") ||
      (body.legacyPassword !== undefined && (typeof body.legacyPassword !== "string" || body.legacyPassword.length > 72))) {
    return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 422, headers });
  }
  try {
    const customer = await connectClerkCustomer(storefrontBearerToken(request) ?? "", body.legacyPassword as string | undefined);
    return NextResponse.json({ ok: true, customer: { contactMasked: customer.contactMasked } }, { headers });
  } catch (error) { return failure(error); }
}
