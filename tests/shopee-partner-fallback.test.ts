import { afterEach, describe, expect, it } from "vitest";
import {
  assertShopeeAndroidFallbackGraceElapsed,
  ShopeeAndroidFallbackGraceError,
  shopeeAndroidFallbackDelayMs,
} from "@/server/payment/shopee-partner-fallback";

const originalDelay = process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS;

afterEach(() => {
  if (originalDelay === undefined) {
    delete process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS;
  } else {
    process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS = originalDelay;
  }
});

describe("Shopee Android fallback grace", () => {
  it("gives cookie polling a 90-second primary window by default", () => {
    delete process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS;
    expect(shopeeAndroidFallbackDelayMs()).toBe(90_000);
  });

  it("bounds operator configuration to a safe payment-window range", () => {
    process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS = "5";
    expect(shopeeAndroidFallbackDelayMs()).toBe(30_000);
    process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS = "999";
    expect(shopeeAndroidFallbackDelayMs()).toBe(240_000);
  });

  it("keeps Android retryable until the web-session grace period passes", () => {
    process.env.SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS = "90";
    const receivedAt = new Date("2026-09-07T07:00:00.000Z");

    expect(() => assertShopeeAndroidFallbackGraceElapsed({
      receivedAt,
      now: new Date("2026-09-07T07:00:30.000Z"),
    })).toThrowError(ShopeeAndroidFallbackGraceError);

    try {
      assertShopeeAndroidFallbackGraceElapsed({
        receivedAt,
        now: new Date("2026-09-07T07:00:30.001Z"),
      });
    } catch (error) {
      expect(error).toMatchObject({ retryAfterSeconds: 60 });
    }

    expect(() => assertShopeeAndroidFallbackGraceElapsed({
      receivedAt,
      now: new Date("2026-09-07T07:01:30.000Z"),
    })).not.toThrow();
  });
});
