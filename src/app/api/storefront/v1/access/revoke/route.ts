import { NextResponse, type NextRequest } from "next/server";
import { authenticateStorefrontRequest } from "@/server/storefront/auth";
import { revokeWebCustomerSession } from "@/server/storefront/customer-access";
import { storefrontAuthenticationResponse, storefrontBearerToken } from "@/server/storefront/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authentication = authenticateStorefrontRequest(request);
  if (!authentication.ok) return storefrontAuthenticationResponse(authentication);
  await revokeWebCustomerSession(storefrontBearerToken(request));
  return NextResponse.json({ ok: true }, { headers: { "cache-control": "private, no-store" } });
}
