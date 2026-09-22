import { booleanEnv, optionalEnv } from "@/server/env";

export function androidPaymentBridgeEnabled(): boolean {
  return booleanEnv(
    "ANDROID_PAYMENT_BRIDGE_ENABLED",
    booleanEnv("DANA_ANDROID_BRIDGE_ENABLED", false),
  );
}

export function androidPaymentBridgeSecret(): string | undefined {
  return optionalEnv("ANDROID_PAYMENT_BRIDGE_SECRET") ??
    optionalEnv("DANA_ANDROID_BRIDGE_SECRET");
}
