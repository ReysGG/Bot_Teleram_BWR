import { NextResponse, type NextRequest } from "next/server";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { connectStorefrontAccount, loadStorefrontAccount } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { clearCustomerSessionCookie } from "@/lib/customer-session";
import { consumeStorefrontRateLimit, storefrontMutationOriginAllowed, storefrontRequestFingerprint } from "@/lib/request-rate-limit";

export async function POST(request: NextRequest) {
  const headers = { "cache-control": "private, no-store" };
  if (!storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403, headers });
  if (!clerkCommerceEnabled()) return NextResponse.json({ ok: false, code: "account_unavailable" }, { status: 503, headers });
  const limit = consumeStorefrontRateLimit({ key: "account-connect:" + storefrontRequestFingerprint(request), limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429, headers });
  const token = await commerceAccessToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, code: "sign_in_required" }, { status: 401, headers });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 422, headers }); }
  if (!body || typeof body !== "object" || (body.legacyPassword !== undefined && (typeof body.legacyPassword !== "string" || body.legacyPassword.length > 72))) return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 422, headers });
  try {
    await connectStorefrontAccount(token, body.legacyPassword);
    const response = NextResponse.json({ ok: true }, { headers });
    clearCustomerSessionCookie(response);
    return response;
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof StoreApiError ? error.code : "account_unavailable" }, { status: error instanceof StoreApiError ? error.status : 503, headers });
  }
}

export async function GET(request: NextRequest) {
  const headers = { "cache-control": "private, no-store" };
  const token = await commerceAccessToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false }, { status: 401, headers });
  try {
    const account = await loadStorefrontAccount(token);
    return NextResponse.json({ ok: true, balance: account.wallet.balance }, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false }, { status: error instanceof StoreApiError ? error.status : 503, headers });
  }
}
