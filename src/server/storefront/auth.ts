import type { NextRequest } from "next/server";
import { optionalEnv } from "@/server/env";
import { hmacHex, safeEqual, sha256 } from "@/server/security/crypto";

const MAXIMUM_CLOCK_SKEW_MS = 2 * 60_000;
const MAXIMUM_REPLAY_ENTRIES = 10_000;
const KEY_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/;

type ReplayState = {
  entries: Map<string, number>;
  lastPrunedAt: number;
};

const globalForStorefrontAuth = globalThis as typeof globalThis & {
  storefrontApiReplayState?: ReplayState;
};

const replayState = globalForStorefrontAuth.storefrontApiReplayState ?? {
  entries: new Map<string, number>(),
  lastPrunedAt: 0,
};

if (process.env.NODE_ENV !== "production") {
  globalForStorefrontAuth.storefrontApiReplayState = replayState;
}

export type StorefrontAuthenticationResult =
  | { ok: true; keyId: string; requestId: string }
  | { ok: false; code: "CONFIGURATION" | "INVALID" | "REPLAY"; status: 401 | 409 | 503 };

function pruneReplayEntries(now: number) {
  if (
    now - replayState.lastPrunedAt < 30_000 &&
    replayState.entries.size <= MAXIMUM_REPLAY_ENTRIES
  ) {
    return;
  }
  for (const [key, expiresAt] of replayState.entries) {
    if (expiresAt <= now) replayState.entries.delete(key);
  }
  while (replayState.entries.size > MAXIMUM_REPLAY_ENTRIES) {
    const oldest = replayState.entries.keys().next().value as string | undefined;
    if (!oldest) break;
    replayState.entries.delete(oldest);
  }
  replayState.lastPrunedAt = now;
}

export function storefrontCanonicalRequest(input: {
  body: string;
  method: string;
  path: string;
  requestId: string;
  timestamp: string;
}) {
  return [
    input.timestamp,
    input.requestId,
    input.method.toUpperCase(),
    input.path,
    sha256(input.body),
  ].join(".");
}

export function authenticateStorefrontRequest(
  request: Pick<NextRequest, "headers" | "method" | "url">,
  rawBody = "",
  now = Date.now(),
): StorefrontAuthenticationResult {
  const configuredKeyId = optionalEnv("STOREFRONT_API_KEY_ID");
  const secret = optionalEnv("STOREFRONT_API_SHARED_SECRET");
  if (
    !configuredKeyId ||
    !KEY_ID_PATTERN.test(configuredKeyId) ||
    !secret ||
    secret.length < 32
  ) {
    return { ok: false, code: "CONFIGURATION", status: 503 };
  }

  const keyId = request.headers.get("x-storefront-key-id")?.trim() ?? "";
  const requestId = request.headers.get("x-storefront-request-id")?.trim() ?? "";
  const timestamp = request.headers.get("x-storefront-timestamp")?.trim() ?? "";
  const signature = request.headers.get("x-storefront-signature")?.trim() ?? "";
  if (
    keyId !== configuredKeyId ||
    !REQUEST_ID_PATTERN.test(requestId) ||
    !/^\d{13}$/.test(timestamp) ||
    !SIGNATURE_PATTERN.test(signature) ||
    Math.abs(now - Number(timestamp)) > MAXIMUM_CLOCK_SKEW_MS
  ) {
    return { ok: false, code: "INVALID", status: 401 };
  }

  const url = new URL(request.url);
  const expectedSignature = hmacHex(secret, storefrontCanonicalRequest({
    body: rawBody,
    method: request.method,
    path: url.pathname + url.search,
    requestId,
    timestamp,
  }));
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, code: "INVALID", status: 401 };
  }

  pruneReplayEntries(now);
  const replayKey = keyId + ":" + requestId;
  if ((replayState.entries.get(replayKey) ?? 0) > now) {
    return { ok: false, code: "REPLAY", status: 409 };
  }
  replayState.entries.set(replayKey, now + MAXIMUM_CLOCK_SKEW_MS);
  return { ok: true, keyId, requestId };
}

export function resetStorefrontReplayCacheForTests() {
  replayState.entries.clear();
  replayState.lastPrunedAt = 0;
}
