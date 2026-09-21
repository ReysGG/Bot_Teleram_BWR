import { describe, expect, it } from "vitest";
import type { PaymentMethodAvailability } from "@/server/payment/method-availability";
import { resolveTelegramPaymentOptions } from "@/server/telegram/payment-option-availability";

function methods(
  overrides: Partial<PaymentMethodAvailability> = {},
): PaymentMethodAvailability {
  return {
    qrisDanaEnabled: true,
    walletCheckoutEnabled: true,
    mixedWalletQrisEnabled: true,
    walletTopupEnabled: true,
    usdtBep20Enabled: false,
    binanceInternalEnabled: false,
    jagoTransferEnabled: false,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

function resolve(overrides: Partial<Parameters<typeof resolveTelegramPaymentOptions>[0]> = {}) {
  return resolveTelegramPaymentOptions({
    checkoutAllowed: true,
    walletBalance: 20_000,
    subtotal: 10_000,
    paymentMethods: methods(),
    qrisReady: true,
    usdtBep20Ready: false,
    binanceInternalReady: false,
    jagoTransferReady: false,
    ...overrides,
  });
}

describe("Telegram payment option availability", () => {
  it("localizes the payment prompt and blocked state for English buyers", () => {
    expect(resolve({ locale: "en" }).prompt).toBe("Choose a payment method:");
    expect(resolve({ locale: "en", checkoutAllowed: false }).prompt).toContain("Checkout is currently unavailable");
  });
  it("hides every disabled method and shows a clear empty state", () => {
    const result = resolve({
      paymentMethods: methods({
        qrisDanaEnabled: false,
        walletCheckoutEnabled: false,
        mixedWalletQrisEnabled: false,
        walletTopupEnabled: false,
      }),
      walletBalance: 0,
    });

    expect(result).toMatchObject({
      wallet: false,
      mixed: false,
      topup: false,
      qris: false,
      usdtBep20: false,
      binanceInternal: false,
      jagoTransfer: false,
      hasPaymentOption: false,
      prompt: "Semua metode pembayaran baru sedang dinonaktifkan admin.",
    });
  });

  it("requires wallet, QRIS, and mixed toggles before showing mixed checkout", () => {
    expect(resolve({ walletBalance: 5_000 }).mixed).toBe(true);
    expect(resolve({
      walletBalance: 5_000,
      paymentMethods: methods({ mixedWalletQrisEnabled: false }),
    }).mixed).toBe(false);
    expect(resolve({
      walletBalance: 5_000,
      paymentMethods: methods({ qrisDanaEnabled: false }),
    }).mixed).toBe(false);
    expect(resolve({
      walletBalance: 5_000,
      paymentMethods: methods({ walletCheckoutEnabled: false }),
    }).mixed).toBe(false);
    expect(resolve({ walletBalance: 5_000, qrisReady: false }).mixed).toBe(false);
    expect(resolve({ qrisReady: false }).qris).toBe(false);
  });

  it("offers top up when wallet checkout and either QRIS or Bank Jago is ready", () => {
    expect(resolve({
      walletBalance: 0,
      paymentMethods: methods({ qrisDanaEnabled: false }),
    }).topup).toBe(false);
    expect(resolve({
      walletBalance: 0,
      paymentMethods: methods({ qrisDanaEnabled: false, walletTopupEnabled: false }),
    }).topup).toBe(false);
    expect(resolve({
      walletBalance: 0,
      paymentMethods: methods({ qrisDanaEnabled: false, walletCheckoutEnabled: false }),
    }).topup).toBe(false);
    expect(resolve({
      walletBalance: 0,
      paymentMethods: methods({ walletCheckoutEnabled: false }),
    }).topup).toBe(false);
    expect(resolve({
      walletBalance: 0,
      paymentMethods: methods({
        qrisDanaEnabled: false,
        jagoTransferEnabled: true,
      }),
      jagoTransferReady: true,
    }).topup).toBe(true);
  });

  it("keeps maintenance and stock blocks distinct from admin-disabled methods", () => {
    expect(resolve({ checkoutAllowed: false }).prompt).toContain("Checkout belum dapat dilanjutkan");
  });

  it("shows only external providers whose effective configuration is ready", () => {
    expect(resolve({
      usdtBep20Ready: true,
      binanceInternalReady: true,
      jagoTransferReady: true,
    })).toMatchObject({
      usdtBep20: true,
      binanceInternal: true,
      jagoTransfer: true,
    });
  });
});
