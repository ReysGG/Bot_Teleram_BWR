import { NextResponse, type NextRequest } from "next/server";
import { commerceAccessToken, clerkCommerceEnabled } from "./commerce-auth";
import { storeApiRequest, StoreApiError } from "./telegram-store-api";
import { consumeStorefrontRateLimit, storefrontMutationOriginAllowed, storefrontRequestFingerprint } from "./request-rate-limit";

export async function proxySmsRequest(request: NextRequest, path: string) {
  const headers = { "cache-control": "private, no-store" };
  if (!clerkCommerceEnabled()) return NextResponse.json({ ok: false, code: "sms_disabled" }, { status: 503, headers });
  if (request.method === "POST" && !storefrontMutationOriginAllowed(request)) return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403, headers });
  const limit = consumeStorefrontRateLimit({ key: `sms:${request.method}:${storefrontRequestFingerprint(request)}`, limit: request.method === "POST" ? 20 : 100, windowMs: 60_000 });
  if (!limit.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429, headers });
  const token = await commerceAccessToken(request.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, code: "sign_in_required" }, { status: 401, headers });
  let body: string | undefined;
  if (request.method === "POST") {
    if (Number(request.headers.get("content-length") || 0) > 4096) return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 413, headers });
    body = await request.text();
    if (Buffer.byteLength(body) > 4096) return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 413, headers });
  }
  try {
    const result = await storeApiRequest(path, { method: request.method, headers: { authorization: `Bearer ${token}` }, ...(body !== undefined ? { body } : {}) });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, code: error instanceof StoreApiError ? error.code : "sms_unavailable" }, { status: error instanceof StoreApiError ? error.status : 503, headers });
  }
}
