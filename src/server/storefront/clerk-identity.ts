import { createClerkClient, verifyToken } from "@clerk/backend";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { maskWebCustomerEmail, normalizeWebCustomerEmail, normalizeWebCustomerPassword, webCustomerContactLookupHash } from "./customer-access";

export class ClerkCommerceError extends Error {
  constructor(public readonly code: "account_unavailable" | "sign_in_required" | "account_setup_required" | "email_verification_required" | "account_link_required" | "invalid_credentials") {
    super(code);
    this.name = "ClerkCommerceError";
  }
}

export function clerkCommerceEnabled() {
  return process.env.STOREFRONT_CLERK_ENABLED === "true";
}

export async function verifyClerkCommerceToken(token: string) {
  const issuer = process.env.STOREFRONT_CLERK_ISSUER?.trim();
  const jwtKey = process.env.STOREFRONT_CLERK_JWT_KEY?.replaceAll("\\n", "\n").trim();
  const authorizedParties = process.env.STOREFRONT_CLERK_AUTHORIZED_PARTIES?.split(",").map(value => value.trim()).filter(Boolean);
  if (!clerkCommerceEnabled() || !issuer || !jwtKey || !authorizedParties?.length) {
    throw new ClerkCommerceError("account_unavailable");
  }
  if (process.env.NODE_ENV === "production" && new URL(issuer).hostname.endsWith(".clerk.accounts.dev")) {
    throw new ClerkCommerceError("account_unavailable");
  }
  if (token.length > 16_384 || !token.startsWith("clerk:")) throw new ClerkCommerceError("sign_in_required");
  let result;
  try {
    result = await verifyToken(token.slice(6), { jwtKey, authorizedParties, clockSkewInMs: 0 });
  } catch {
    throw new ClerkCommerceError("sign_in_required");
  }
  const claims = result;
  // Verify the instance and session type in addition to the SDK's signature/time checks.
  if (!claims || claims.iss !== issuer ||
      typeof claims.sub !== "string" || !/^user_[A-Za-z0-9]+$/.test(claims.sub) ||
      typeof claims.sid !== "string" || !/^sess_[A-Za-z0-9]+$/.test(claims.sid) ||
      typeof claims.azp !== "string" || !authorizedParties.includes(claims.azp) ||
      (claims.sts !== undefined && claims.sts !== "active") ||
      typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000 ||
      typeof claims.iat !== "number" || claims.exp - claims.iat > 120 || claims.iat > Date.now() / 1000) {
    throw new ClerkCommerceError("sign_in_required");
  }
  return { issuer, userId: claims.sub };
}

export async function requireClerkCustomer(token: string) {
  const identity = await verifyClerkCommerceToken(token);
  const customer = await prisma.webCustomer.findUnique({
    where: { clerkIssuer_clerkUserId: { clerkIssuer: identity.issuer, clerkUserId: identity.userId } },
  });
  if (!customer) throw new ClerkCommerceError("account_setup_required");
  return customer;
}

async function verifiedPrimaryEmail(userId: string) {
  const secretKey = process.env.STOREFRONT_CLERK_SECRET_KEY?.trim();
  if (!secretKey) throw new ClerkCommerceError("account_unavailable");
  let user;
  try {
    user = await createClerkClient({ secretKey }).users.getUser(userId);
  } catch {
    throw new ClerkCommerceError("account_unavailable");
  }
  if (user.id !== userId || user.banned || user.locked) throw new ClerkCommerceError("sign_in_required");
  const email = user.emailAddresses.find(value => value.id === user.primaryEmailAddressId);
  if (!email || email.verification?.status !== "verified") throw new ClerkCommerceError("email_verification_required");
  return normalizeWebCustomerEmail(email.emailAddress);
}

// This command is invoked only by an explicit, signed POST from the account page.
// Reading an account or rendering a page never creates/links a customer.
export async function connectClerkCustomer(token: string, legacyPassword?: string) {
  const identity = await verifyClerkCommerceToken(token);
  const bound = await prisma.webCustomer.findUnique({
    where: { clerkIssuer_clerkUserId: { clerkIssuer: identity.issuer, clerkUserId: identity.userId } },
  });
  if (bound) return bound;
  const email = await verifiedPrimaryEmail(identity.userId);
  const lookup = webCustomerContactLookupHash(email);
  const inaccessiblePasswordHash = await bcrypt.hash(randomBytes(48).toString("base64url"), 12);
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web_clerk_${identity.issuer}_${identity.userId}`}))`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web_contact_${lookup}`}))`;
    const raced = await tx.webCustomer.findUnique({
      where: { clerkIssuer_clerkUserId: { clerkIssuer: identity.issuer, clerkUserId: identity.userId } },
    });
    if (raced) return { customer: raced };
    const existing = await tx.webCustomer.findUnique({ where: { contactLookupHash: lookup } });
    const now = new Date();
    const binding = { clerkIssuer: identity.issuer, clerkUserId: identity.userId, clerkLinkedAt: now };
    if (!existing) {
      return { customer: await tx.webCustomer.create({ data: {
        contactLookupHash: lookup, contactMasked: maskWebCustomerEmail(email),
        passwordHash: inaccessiblePasswordHash, ...binding,
      } }) };
    }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web_customer_auth_${existing.id}`}))`;
    const current = await tx.webCustomer.findUniqueOrThrow({ where: { id: existing.id } });
    if (current.clerkUserId) return { error: "invalid_credentials" as const };
    if (!legacyPassword) return { error: "account_link_required" as const };
    if (current.lockedUntil && current.lockedUntil > now) return { error: "invalid_credentials" as const };
    let normalized = "";
    try { normalized = normalizeWebCustomerPassword(legacyPassword); } catch { /* Treat invalid format as a failed attempt. */ }
    if (!normalized || !await bcrypt.compare(normalized, current.passwordHash)) {
      const attempts = current.lockedUntil && current.lockedUntil <= now ? 1 : current.failedAttempts + 1;
      await tx.webCustomer.update({ where: { id: current.id }, data: {
        failedAttempts: attempts, lockedUntil: attempts >= 5 ? new Date(now.getTime() + 15 * 60_000) : null,
      } });
      // Return, rather than throw, so the failed-attempt counter commits.
      return { error: "invalid_credentials" as const };
    }
    const customer = await tx.webCustomer.update({ where: { id: current.id }, data: {
      ...binding, passwordHash: inaccessiblePasswordHash, failedAttempts: 0, lockedUntil: null,
    } });
    await tx.webCustomerSession.updateMany({ where: { webCustomerId: current.id, revokedAt: null }, data: { revokedAt: now } });
    return { customer };
  }, { timeout: 15_000 });
  if (result.error) throw new ClerkCommerceError(result.error);
  return result.customer!;
}
