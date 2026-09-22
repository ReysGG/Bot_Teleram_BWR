import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { commerceAccessToken } from "@/lib/commerce-auth";
import { consumeStorefrontRateLimit, storefrontMutationOriginAllowed, storefrontRequestFingerprint } from "@/lib/request-rate-limit";
import { requireWebCustomerSession } from "@/server/storefront/customer-access";
import { submitRating } from "@/server/ratings/service";

export async function POST(request: NextRequest) {
  const headers = { "cache-control": "private, no-store" };
  const reply = (code: string, status: number) => NextResponse.json({ ok: false, code }, { status, headers });
  if (process.env.RATINGS_ENABLED !== "true") return reply("ratings_disabled", 503);
  if (!storefrontMutationOriginAllowed(request)) return reply("invalid_origin", 403);
  if (!consumeStorefrontRateLimit({ key: "ratings:" + storefrontRequestFingerprint(request), limit: 20, windowMs: 60000 }).allowed) return reply("rate_limited", 429);
  let customerId: string;
  try { customerId = (await requireWebCustomerSession(await commerceAccessToken(request.headers.get("authorization")))).webCustomerId; }
  catch { return reply("sign_in_required", 401); }
  const body = await request.text();
  if (Buffer.byteLength(body) > 12000) return reply("body_too_large", 413);
  try {
    const rating = await submitRating(customerId, JSON.parse(body));
    return NextResponse.json({ ok: true, rating }, { headers });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return reply("invalid_input", 422);
    const code = error instanceof Error ? error.message : "";
    if (["rating_order_missing", "rating_seller_missing"].includes(code)) return reply(code, 404);
    if (["rating_order_ineligible", "rating_delivery_pending", "rating_self_review"].includes(code)) return reply(code, 409);
    return reply("ratings_unavailable", 503);
  }
}
