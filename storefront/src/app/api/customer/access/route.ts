import { NextResponse, type NextRequest } from "next/server";
import { clerkCommerceEnabled } from "@/lib/commerce-auth";
import { authenticateOrderAccess } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { setCustomerSessionCookie } from "@/lib/customer-session";
import {
  consumeStorefrontRateLimit,
  storefrontMutationOriginAllowed,
  storefrontRequestFingerprint,
} from "@/lib/request-rate-limit";

export async function POST(request: NextRequest) {
  if (clerkCommerceEnabled()) return NextResponse.json({ ok: false, code: "use_account_linking" }, { status: 409 });
  if (!storefrontMutationOriginAllowed(request)) {
    return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  }
  const rate = consumeStorefrontRateLimit({
    key: "order-access:" + storefrontRequestFingerprint(request),
    limit: 10,
    windowMs: 10 * 60_000,
  });
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSeconds) } },
    );
  }
  let body: { identifier?: unknown; password?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 400 });
  }
  if (
    typeof body.identifier !== "string" ||
    typeof body.password !== "string" ||
    body.identifier.length > 254 ||
    body.password.length > 72
  ) {
    return NextResponse.json({ ok: false, code: "invalid_input" }, { status: 422 });
  }
  try {
    const access = await authenticateOrderAccess({
      identifier: body.identifier,
      password: body.password,
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.json({
      ok: true,
      customer: access.customer,
      orders: access.orders,
    });
    setCustomerSessionCookie(response, access.sessionToken, access.expiresAt);
    return response;
  } catch (error) {
    const invalid = error instanceof StoreApiError && error.status === 401;
    return NextResponse.json(
      { ok: false, code: invalid ? "invalid_credentials" : "access_unavailable" },
      { status: invalid ? 401 : 503 },
    );
  }
}
