import { createHash, createHmac, randomUUID } from "node:crypto";
import "server-only";

export type StorefrontApiStatus = {
  configured: boolean;
  baseUrl: string | null;
};

export class StoreApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("Telegram store API returned " + status);
    this.name = "StoreApiError";
  }
}

function apiBaseUrl(): string | null {
  const value = process.env.TELEGRAM_STORE_API_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.hostname !== "localhost") return null;
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function storefrontApiStatus(): StorefrontApiStatus {
  const baseUrl = apiBaseUrl();
  const keyId = process.env.TELEGRAM_STORE_API_KEY_ID?.trim();
  const secret = process.env.TELEGRAM_STORE_API_SHARED_SECRET?.trim();
  return {
    configured: Boolean(baseUrl && keyId && secret && secret.length >= 32),
    baseUrl,
  };
}

export async function storeApiFetch(
  path: string,
  init: RequestInit = {},
) {
  const baseUrl = apiBaseUrl();
  if (!baseUrl) throw new Error("Telegram store API is not configured");

  const secret = process.env.TELEGRAM_STORE_API_SHARED_SECRET?.trim();
  if (!secret) throw new Error("Telegram store API secret is not configured");
  const keyId = process.env.TELEGRAM_STORE_API_KEY_ID?.trim();
  if (!keyId) throw new Error("Telegram store API key ID is not configured");
  const method = (init.method ?? "GET").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const timestamp = String(Date.now());
  const requestId = randomUUID();
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const signature = createHmac("sha256", secret)
    .update(timestamp + "." + requestId + "." + method + "." + path + "." + bodyHash)
    .digest("hex");
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (body) headers.set("content-type", "application/json");
  headers.set("x-storefront-key-id", keyId);
  headers.set("x-storefront-request-id", requestId);
  headers.set("x-storefront-timestamp", timestamp);
  headers.set("x-storefront-signature", signature);
  return fetch(baseUrl + path, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(8_000),
  });
}

export async function storeApiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await storeApiFetch(path, init);
  if (!response.ok) {
    let code = "request_failed";
    try {
      const payload = await response.json() as { code?: unknown };
      if (typeof payload.code === "string") code = payload.code;
    } catch {
      // Upstream errors are intentionally reduced to a stable public code.
    }
    throw new StoreApiError(response.status, code);
  }
  return response.json() as Promise<T>;
}
