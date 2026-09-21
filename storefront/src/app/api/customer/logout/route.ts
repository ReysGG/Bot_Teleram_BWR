import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, clearCustomerSessionCookie } from "@/lib/customer-session";
import { storefrontMutationOriginAllowed } from "@/lib/request-rate-limit";
import { revokeCustomerSession } from "@/lib/store-api";

export async function POST(request: NextRequest) {
  if (!storefrontMutationOriginAllowed(request)) {
    return NextResponse.json({ ok: false, code: "invalid_origin" }, { status: 403 });
  }
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  if (token) await revokeCustomerSession(token).catch(() => null);
  const response = NextResponse.json({ ok: true });
  clearCustomerSessionCookie(response);
  return response;
}
