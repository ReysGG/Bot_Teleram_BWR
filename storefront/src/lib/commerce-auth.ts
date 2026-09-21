import "server-only";
import { auth } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE } from "./customer-session";
import { clerkCommerceTokenFromAuthorization } from "./clerk-token-transport";

export function clerkCommerceEnabled() {
  return process.env.STOREFRONT_CLERK_COMMERCE_ENABLED === "true";
}

export async function commerceAccessToken(authorization?: string | null): Promise<string | undefined> {
  if (!clerkCommerceEnabled()) return (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  // Browser components can become signed in a fraction before the new session
  // cookie is visible to a freshly rendered Route Handler. Accept the
  // same-origin Bearer token and keep the backend as the verification boundary.
  const browserToken = clerkCommerceTokenFromAuthorization(authorization);
  if (browserToken) return browserToken;
  // No fallback to a previous buyer's legacy cookie when signed out or switching Clerk users.
  const session = await auth();
  if (!session.userId) return undefined;
  // Preserve the browser-origin claim (azp). Minting a replacement through
  // Clerk BAPI omits azp and our commerce verifier correctly rejects it.
  // The default also reuses the verified request token without a network call.
  const token = await session.getToken();
  return token ? `clerk:${token}` : undefined;
}
