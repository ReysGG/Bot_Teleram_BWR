import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateStorefrontRequest,
  resetStorefrontReplayCacheForTests,
} from "@/server/storefront/auth";

const keyId = "storefront-primary";
const secret = "test-storefront-secret-that-is-at-least-32-characters";
const path = "/api/storefront/v1/catalog";

function signedRequest(input: {
  requestId?: string;
  timestamp?: string;
  signaturePath?: string;
} = {}) {
  const requestId = input.requestId ?? randomUUID();
  const timestamp = input.timestamp ?? String(Date.now());
  const signaturePath = input.signaturePath ?? path;
  const bodyHash = createHash("sha256").update("").digest("hex");
  const signature = createHmac("sha256", secret)
    .update([timestamp, requestId, "GET", signaturePath, bodyHash].join("."))
    .digest("hex");
  return new Request("https://store.example" + path, {
    headers: {
      "x-storefront-key-id": keyId,
      "x-storefront-request-id": requestId,
      "x-storefront-timestamp": timestamp,
      "x-storefront-signature": signature,
    },
  });
}

describe("storefront service API authentication", () => {
  beforeEach(() => {
    vi.stubEnv("STOREFRONT_API_KEY_ID", keyId);
    vi.stubEnv("STOREFRONT_API_SHARED_SECRET", secret);
    resetStorefrontReplayCacheForTests();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("accepts a correctly signed request", () => {
    expect(authenticateStorefrontRequest(signedRequest())).toMatchObject({ ok: true });
  });

  it("rejects a signature made for a different path", () => {
    expect(authenticateStorefrontRequest(signedRequest({
      signaturePath: "/api/storefront/v1/other",
    }))).toEqual({ ok: false, code: "INVALID", status: 401 });
  });

  it("rejects stale timestamps", () => {
    expect(authenticateStorefrontRequest(signedRequest({
      timestamp: String(Date.now() - 5 * 60_000),
    }))).toEqual({ ok: false, code: "INVALID", status: 401 });
  });

  it("rejects replayed request IDs", () => {
    const requestId = randomUUID();
    const request = signedRequest({ requestId });
    expect(authenticateStorefrontRequest(request)).toMatchObject({ ok: true });
    expect(authenticateStorefrontRequest(request)).toEqual({
      ok: false,
      code: "REPLAY",
      status: 409,
    });
  });

  it("fails closed when the server key is not configured", () => {
    vi.stubEnv("STOREFRONT_API_SHARED_SECRET", "");
    expect(authenticateStorefrontRequest(signedRequest())).toEqual({
      ok: false,
      code: "CONFIGURATION",
      status: 503,
    });
  });
});
