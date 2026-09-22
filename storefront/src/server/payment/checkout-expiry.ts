import { integerEnv } from "@/server/env";

export const DEFAULT_PAYMENT_EXPIRY_MINUTES = 5;
export const DEFAULT_USDT_BEP20_EXPIRY_MINUTES = 30;

export function checkoutPaymentExpiryMinutes(paymentMethod: string): number {
  return paymentMethod === "USDT_BEP20"
    ? integerEnv(
        "USDT_BEP20_PAYMENT_EXPIRY_MINUTES",
        DEFAULT_USDT_BEP20_EXPIRY_MINUTES,
      )
    : integerEnv("PAYMENT_EXPIRY_MINUTES", DEFAULT_PAYMENT_EXPIRY_MINUTES);
}
