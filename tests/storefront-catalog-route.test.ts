import { createHash, createHmac, randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCatalog: vi.fn(),
}));

vi.mock("@/server/storefront/catalog", () => ({
  loadStorefrontCatalogSnapshot: mocks.loadCatalog,
}));

import { GET } from "@/app/api/storefront/v1/catalog/route";
import { resetStorefrontReplayCacheForTests } from "@/server/storefront/auth";

const keyId = "storefront-primary";
const secret = "test-storefront-secret-that-is-at-least-32-characters";
const path = "/api/storefront/v1/catalog";

function request(signed = true) {
  const requestId = randomUUID();
  const timestamp = String(Date.now());
  const bodyHash = createHash("sha256").update("").digest("hex");
  const signature = createHmac("sha256", secret)
    .update([timestamp, requestId, "GET", path, bodyHash].join("."))
    .digest("hex");
  return new NextRequest("https://store.example" + path, {
    headers: signed
      ? {
          "x-storefront-key-id": keyId,
          "x-storefront-request-id": requestId,
          "x-storefront-timestamp": timestamp,
          "x-storefront-signature": signature,
        }
      : undefined,
  });
}

describe("storefront catalog API route", () => {
  beforeEach(() => {
    vi.stubEnv("STOREFRONT_API_KEY_ID", keyId);
    vi.stubEnv("STOREFRONT_API_SHARED_SECRET", secret);
    resetStorefrontReplayCacheForTests();
    mocks.loadCatalog.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns the signed public catalog without exposing an envelope", async () => {
    mocks.loadCatalog.mockResolvedValue({
      source: "api",
      generatedAt: "2026-09-15T00:00:00.000Z",
      groups: [{ id: "group-1", name: "ChatGPT" }],
      products: [{ id: "product-1", name: "ChatGPT Plus" }],
      paymentMethods: ["Wallet", "QRIS"],
    });

    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-storefront-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({
      source: "api",
      groups: [{ name: "ChatGPT" }],
      products: [{ name: "ChatGPT Plus" }],
    });
  });

  it("rejects unsigned requests before loading catalog data", async () => {
    const response = await GET(request(false));
    expect(response.status).toBe(401);
    expect(mocks.loadCatalog).not.toHaveBeenCalled();
  });

  it("fails closed when catalog loading fails", async () => {
    mocks.loadCatalog.mockRejectedValue(new Error("database unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "catalog_unavailable",
    });
  });
});
