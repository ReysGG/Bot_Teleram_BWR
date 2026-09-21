import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  process: vi.fn(),
}));

vi.mock("@/server/payment/android-bridge-config", () => ({
  androidPaymentBridgeEnabled: () => true,
  androidPaymentBridgeSecret: () => "x".repeat(32),
}));
vi.mock("@/server/payment/android-bridge", () => ({
  processAndroidBridgeNotification: mocks.process,
}));
vi.mock("@/server/security/crypto", () => ({
  verifyTimestampedHmac: () => true,
}));
vi.mock("@/server/security/rate-limit", () => ({
  consumeRateLimit: () => true,
  rateLimitSource: () => "test",
}));

import { POST } from "@/app/api/bridge/android/notification/route";
import { ShopeeAndroidFallbackGraceError } from "@/server/payment/shopee-partner-fallback";

function request() {
  return new NextRequest("https://store.example/api/bridge/android/notification", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bridge-timestamp": String(Date.now()),
      "x-bridge-signature": "signature",
    },
    body: JSON.stringify({
      eventId: "event-1234567890abcdef",
      deviceId: "android-device-1",
      packageName: "com.shopeepay.merchant.id",
      title: "Shopee Partner",
      body: "Pembayaran sebesar Rp12.011 telah diterima pada transaksi test.",
      postedAt: "2026-09-07T07:15:40.000Z",
    }),
  });
}

describe("Android bridge route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps Shopee Android evidence retryable during the web-session grace period", async () => {
    mocks.process.mockRejectedValue(new ShopeeAndroidFallbackGraceError(57));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("57");
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "shopee_web_session_primary_pending",
    });
  });

  it("keeps unrelated processing failures generic", async () => {
    mocks.process.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false });
  });
});
