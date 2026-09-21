import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";

type RateLimitState = Map<string, { count: number; resetAt: number }>;

const globalForRateLimit = globalThis as typeof globalThis & {
  storefrontRateLimits?: RateLimitState;
};

const limits = globalForRateLimit.storefrontRateLimits ?? new Map();
if (process.env.NODE_ENV !== "production") globalForRateLimit.storefrontRateLimits = limits;

export function storefrontRequestFingerprint(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip")?.trim() || "local";
  const agent = request.headers.get("user-agent")?.slice(0, 300) ?? "unknown";
  return createHash("sha256").update(address + "\0" + agent).digest("hex");
}

export function consumeStorefrontRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const current = limits.get(input.key);
  if (!current || current.resetAt <= now) {
    limits.set(input.key, { count: 1, resetAt: now + input.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (current.count >= input.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000)),
    };
  }
  current.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

export function storefrontMutationOriginAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production";
  try {
    const configured = process.env.APP_URL?.trim();
    const expected = configured ? new URL(configured).origin : request.nextUrl.origin;
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}
