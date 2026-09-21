import { NextResponse, type NextRequest } from "next/server";
import { createClerkCheckout, createStorefrontCheckout } from "@/lib/store-api";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { StoreApiError } from "@/lib/telegram-store-api";
import { setCustomerSessionCookie } from "@/lib/customer-session";
import {
  consumeStorefrontRateLimit,
  storefrontMutationOriginAllowed,
  storefrontRequestFingerprint,
} from "@/lib/request-rate-limit";

const paymentMethods = new Set([
  "DANA",
  "WALLET",
  "WALLET_QRIS",
  "USDT_BEP20",
  "BINANCE_INTERNAL",
  "JAGO_TRANSFER",
]);

export async function POST(request: NextRequest) {
  if (!storefrontMutationOriginAllowed(request)) {
    return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  }
  const rate = consumeStorefrontRateLimit({
    key: "checkout:" + storefrontRequestFingerprint(request),
    limit: 12,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_checkout" }, { status: 400 });
  }
  if (
    (!clerkCommerceEnabled() && (typeof body.email !== "string" || typeof body.password !== "string")) ||
    typeof body.productId !== "string" ||
    typeof body.paymentMethod !== "string" ||
    typeof body.idempotencyKey !== "string" ||
    !paymentMethods.has(body.paymentMethod) ||
    !Number.isInteger(body.quantity) ||
    Number(body.quantity) < 1 ||
    Number(body.quantity) > 750 ||
    !/^[A-Za-z0-9:_-]{16,120}$/.test(body.idempotencyKey)
  ) {
    return NextResponse.json({ ok: false, code: "invalid_checkout" }, { status: 422 });
  }
  try {
    if (clerkCommerceEnabled()) {
      const token = await commerceAccessToken();
      if (!token) return NextResponse.json({ ok: false, code: "sign_in_required" }, { status: 401 });
      const checkout = await createClerkCheckout(token, {
        productId: body.productId as string, paymentMethod: body.paymentMethod as string,
        quantity: Number(body.quantity), idempotencyKey: body.idempotencyKey as string,
      });
      return NextResponse.json(checkout, { status: 201, headers: { "cache-control": "private, no-store" } });
    }
    const checkout = await createStorefrontCheckout({
      email: body.email as string,
      password: body.password as string,
      productId: body.productId,
      paymentMethod: body.paymentMethod,
      quantity: Number(body.quantity),
      idempotencyKey: body.idempotencyKey,
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json({ ok: true, order: checkout.order }, { status: 201 });
    setCustomerSessionCookie(response, checkout.sessionToken, checkout.expiresAt);
    return response;
  } catch (error) {
    if (error instanceof StoreApiError) {
      return NextResponse.json(
        { ok: false, code: error.code },
        { status: error.status },
      );
    }
    return NextResponse.json({ ok: false, code: "checkout_unavailable" }, { status: 503 });
  }
}
