import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { integerEnv, requireEnv } from "@/server/env";
import { hmacHex, sha256 } from "@/server/security/crypto";

const DUMMY_PASSWORD_HASH = "$2b$12$aJmWp/7AhIwRHfXFSSi0EeZ/nDfNM58Zi4akkPQhF3Mmk2feZnA32";
const PASSWORD_COST = 12;
const MAXIMUM_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60_000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000;

const emailSchema = z.string().trim().max(254).email().transform((value) => value.toLowerCase());

export class WebCustomerAccessError extends Error {
  constructor(
    readonly code:
      | "INVALID_CONTACT"
      | "INVALID_CREDENTIALS"
      | "INVALID_PASSWORD"
      | "SESSION_INVALID",
  ) {
    super(code);
    this.name = "WebCustomerAccessError";
  }
}

export function normalizeWebCustomerEmail(value: unknown) {
  const parsed = emailSchema.safeParse(value);
  if (!parsed.success) throw new WebCustomerAccessError("INVALID_CONTACT");
  return parsed.data;
}

export function normalizeWebCustomerPassword(value: unknown) {
  if (typeof value !== "string") {
    throw new WebCustomerAccessError("INVALID_PASSWORD");
  }
  const password = value.normalize("NFKC");
  const byteLength = Buffer.byteLength(password, "utf8");
  if (
    password.length < 8 ||
    password.length > 64 ||
    byteLength > 72 ||
    /[\u0000-\u001f\u007f]/u.test(password)
  ) {
    throw new WebCustomerAccessError("INVALID_PASSWORD");
  }
  return password;
}

export function webCustomerContactLookupHash(email: string) {
  return hmacHex(
    requireEnv("STOREFRONT_CONTACT_LOOKUP_SECRET", 32),
    "email\0" + normalizeWebCustomerEmail(email),
  );
}

export function maskWebCustomerEmail(email: string) {
  const normalized = normalizeWebCustomerEmail(email);
  const [local, domain] = normalized.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return visible + "***@" + domain;
}

export function webCustomerChatId(customerId: string) {
  return "web:" + customerId;
}

function isUniqueConstraint(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002",
  );
}

async function verifyExistingCustomerPassword(
  customer: {
    id: string;
    passwordHash: string;
    failedAttempts: number;
    lockedUntil: Date | null;
  },
  password: string,
) {
  const verified = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`web_customer_auth_${customer.id}`}))`;
    const current = await tx.webCustomer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    if (current.clerkUserId) return false;
    const now = new Date();
    const passwordMatches = await bcrypt.compare(password, current.passwordHash);
    if (current.lockedUntil && current.lockedUntil > now) {
      return false;
    }
    if (!passwordMatches) {
      const attempts = current.lockedUntil && current.lockedUntil <= now
        ? 1
        : current.failedAttempts + 1;
      await tx.webCustomer.update({
        where: { id: current.id },
        data: {
          failedAttempts: attempts,
          lockedUntil: attempts >= MAXIMUM_FAILED_ATTEMPTS
            ? new Date(now.getTime() + LOCK_DURATION_MS)
            : null,
        },
      });
      return false;
    }
    await tx.webCustomer.update({
      where: { id: current.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastAuthenticatedAt: now,
      },
    });
    return true;
  });
  if (!verified) throw new WebCustomerAccessError("INVALID_CREDENTIALS");
}

export async function getOrCreateWebCustomer(input: {
  email: unknown;
  password: unknown;
}) {
  const email = normalizeWebCustomerEmail(input.email);
  const password = normalizeWebCustomerPassword(input.password);
  const contactLookupHash = webCustomerContactLookupHash(email);
  const existing = await prisma.webCustomer.findUnique({
    where: { contactLookupHash },
  });
  if (existing) {
    await verifyExistingCustomerPassword(existing, password);
    return { customer: existing, email, created: false };
  }

  const passwordHash = await bcrypt.hash(password, PASSWORD_COST);
  try {
    const customer = await prisma.webCustomer.create({
      data: {
        contactLookupHash,
        contactMasked: maskWebCustomerEmail(email),
        passwordHash,
        lastAuthenticatedAt: new Date(),
      },
    });
    return { customer, email, created: true };
  } catch (error) {
    if (!isUniqueConstraint(error)) throw error;
    const raced = await prisma.webCustomer.findUniqueOrThrow({
      where: { contactLookupHash },
    });
    await verifyExistingCustomerPassword(raced, password);
    return { customer: raced, email, created: false };
  }
}

async function unknownCredentialDelay(password: string): Promise<never> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
  throw new WebCustomerAccessError("INVALID_CREDENTIALS");
}

export async function findWebCustomerByIdentifier(input: {
  identifier: unknown;
  password: unknown;
}) {
  const password = normalizeWebCustomerPassword(input.password);
  const identifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
  const invoice = /^TGS-\d{8}-[A-Z0-9]{8}$/i.test(identifier)
    ? identifier.toUpperCase()
    : null;
  let customer = invoice
    ? (await prisma.order.findFirst({
        where: { invoiceNumber: invoice, channel: "WEB" },
        select: { webCustomer: true },
      }))?.webCustomer ?? null
    : null;

  if (!invoice) {
    const email = emailSchema.safeParse(identifier);
    if (!email.success) return unknownCredentialDelay(password);
    customer = await prisma.webCustomer.findUnique({
      where: { contactLookupHash: webCustomerContactLookupHash(email.data) },
    });
  }
  if (!customer) return unknownCredentialDelay(password);
  await verifyExistingCustomerPassword(customer, password);
  return customer;
}

export async function createWebCustomerSession(input: {
  customerId: string;
  userAgent?: string | null;
}) {
  if (process.env.STOREFRONT_CLERK_ENABLED === "true") throw new WebCustomerAccessError("SESSION_INVALID");
  const owner = await prisma.webCustomer.findUniqueOrThrow({ where: { id: input.customerId } });
  if (owner.clerkUserId) throw new WebCustomerAccessError("SESSION_INVALID");
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const ttlHours = Math.min(
    168,
    Math.max(1, integerEnv("STOREFRONT_SESSION_TTL_HOURS", 24)),
  );
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60_000);
  await prisma.webCustomerSession.create({
    data: {
      tokenHash: sha256("web-session\0" + token),
      webCustomerId: input.customerId,
      userAgentHash: input.userAgent
        ? sha256(input.userAgent.slice(0, 500))
        : null,
      expiresAt,
      lastUsedAt: now,
    },
  });
  return { token, expiresAt };
}

export async function authenticateWebCustomer(input: {
  identifier: unknown;
  password: unknown;
  userAgent?: string | null;
}) {
  const customer = await findWebCustomerByIdentifier(input);
  const session = await createWebCustomerSession({
    customerId: customer.id,
    userAgent: input.userAgent,
  });
  return { customer, session };
}

export async function requireWebCustomerSession(token: string | null | undefined) {
  if (token?.startsWith("clerk:")) {
    const { requireClerkCustomer, ClerkCommerceError } = await import("./clerk-identity");
    try {
      const customer = await requireClerkCustomer(token);
      return { webCustomerId: customer.id, webCustomer: customer };
    } catch (error) {
      if (error instanceof ClerkCommerceError && error.code !== "account_unavailable") throw new WebCustomerAccessError("SESSION_INVALID");
      throw error;
    }
  }
  if (process.env.STOREFRONT_CLERK_ENABLED === "true") throw new WebCustomerAccessError("SESSION_INVALID");
  if (!token || token.length < 32 || token.length > 200) {
    throw new WebCustomerAccessError("SESSION_INVALID");
  }
  const now = new Date();
  const session = await prisma.webCustomerSession.findUnique({
    where: { tokenHash: sha256("web-session\0" + token) },
    include: { webCustomer: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= now || session.webCustomer.clerkUserId) {
    throw new WebCustomerAccessError("SESSION_INVALID");
  }
  if (now.getTime() - session.lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    await prisma.webCustomerSession.updateMany({
      where: { id: session.id, revokedAt: null, expiresAt: { gt: now } },
      data: { lastUsedAt: now },
    });
  }
  return session;
}

export async function revokeWebCustomerSession(token: string | null | undefined) {
  if (!token || token.length < 32 || token.length > 200) return false;
  const result = await prisma.webCustomerSession.updateMany({
    where: {
      tokenHash: sha256("web-session\0" + token),
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  return result.count === 1;
}

export async function pruneExpiredWebCustomerSessions(now = new Date()) {
  const retentionCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  return prisma.webCustomerSession.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: retentionCutoff } },
        { revokedAt: { lt: retentionCutoff } },
      ],
    },
  });
}
