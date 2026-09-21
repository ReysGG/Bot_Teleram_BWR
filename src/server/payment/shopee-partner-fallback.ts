import { integerEnv } from "@/server/env";

const DEFAULT_DELAY_SECONDS = 90;
const MIN_DELAY_SECONDS = 30;
const MAX_DELAY_SECONDS = 240;

export class ShopeeAndroidFallbackGraceError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Shopee web-session matching is still inside its primary evidence window");
    this.name = "ShopeeAndroidFallbackGraceError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function shopeeAndroidFallbackDelayMs(): number {
  const seconds = integerEnv(
    "SHOPEE_ANDROID_FALLBACK_DELAY_SECONDS",
    DEFAULT_DELAY_SECONDS,
  );
  return Math.min(MAX_DELAY_SECONDS, Math.max(MIN_DELAY_SECONDS, seconds)) * 1000;
}

/**
 * Keep the Android event retryable while cookie polling gets the first chance
 * to confirm the same immutable Shopee invoice.
 */
export function assertShopeeAndroidFallbackGraceElapsed(input: {
  receivedAt: Date;
  now?: Date;
}): void {
  const remainingMs = input.receivedAt.getTime() + shopeeAndroidFallbackDelayMs() -
    (input.now ?? new Date()).getTime();
  if (remainingMs <= 0) return;
  throw new ShopeeAndroidFallbackGraceError(
    Math.max(1, Math.ceil(remainingMs / 1000)),
  );
}
