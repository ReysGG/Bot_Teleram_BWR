import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkoutPaymentExpiryMinutes,
  DEFAULT_PAYMENT_EXPIRY_MINUTES,
  DEFAULT_USDT_BEP20_EXPIRY_MINUTES,
} from "@/server/payment/checkout-expiry";

describe("checkout payment expiry", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("gives BEP20 enough time for an exchange withdrawal to produce a hash", () => {
    vi.stubEnv("PAYMENT_EXPIRY_MINUTES", "5");
    vi.stubEnv("USDT_BEP20_PAYMENT_EXPIRY_MINUTES", "30");

    expect(checkoutPaymentExpiryMinutes("USDT_BEP20")).toBe(30);
    expect(checkoutPaymentExpiryMinutes("DANA")).toBe(5);
  });

  it("uses safe defaults when provider-specific environment is absent", () => {
    vi.stubEnv("PAYMENT_EXPIRY_MINUTES", "");
    vi.stubEnv("USDT_BEP20_PAYMENT_EXPIRY_MINUTES", "");

    expect(checkoutPaymentExpiryMinutes("USDT_BEP20")).toBe(
      DEFAULT_USDT_BEP20_EXPIRY_MINUTES,
    );
    expect(checkoutPaymentExpiryMinutes("JAGO_TRANSFER")).toBe(
      DEFAULT_PAYMENT_EXPIRY_MINUTES,
    );
  });
});
