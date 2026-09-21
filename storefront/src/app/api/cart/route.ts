import { NextResponse, type NextRequest } from "next/server";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { StoreApiError, storeApiRequest } from "@/lib/telegram-store-api";
import { consumeStorefrontRateLimit, storefrontMutationOriginAllowed, storefrontRequestFingerprint } from "@/lib/request-rate-limit";
import type { CartSnapshot } from "@/lib/cart-api-types";

const headers = { "cache-control": "private, no-store" };
async function proxy(request: NextRequest, write: boolean) {
  if (write && !storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403, headers });
  if (!clerkCommerceEnabled()) return NextResponse.json({ ok: false, code: "account_unavailable" }, { status: 503, headers });
  try {
    const token = await commerceAccessToken(request.headers.get("authorization"));
    if (!token?.startsWith("clerk:")) return NextResponse.json({ ok: false, code: "sign_in_required" }, { status: 401, headers });
    if (write) {
      const rate = consumeStorefrontRateLimit({ key: "cart:" + storefrontRequestFingerprint(request), limit: 90, windowMs: 60_000 });
      if (!rate.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429, headers });
    }
    const body = write ? await request.text() : undefined;
    if (body && Buffer.byteLength(body, "utf8") > 4096) return NextResponse.json({ ok: false, code: "payload_too_large" }, { status: 413, headers });
    const result = await storeApiRequest<{ ok: true; cart: CartSnapshot }>("/api/storefront/v1/cart", {
      method: write ? "POST" : "GET", headers: { authorization: "Bearer " + token }, body,
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof StoreApiError ? error.code : "cart_unavailable" }, { status: error instanceof StoreApiError ? error.status : 503, headers });
  }
}
export async function GET(request: NextRequest) { return proxy(request, false); }
export async function POST(request: NextRequest) { return proxy(request, true); }
