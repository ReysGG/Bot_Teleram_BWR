import { describe, expect, it } from "vitest";
import type { PaymentMethodAvailability } from "@/server/payment/method-availability";
import {
  parseWalletTopupAmountCallback,
  parseWalletTopupProviderCallback,
  resolveWalletTopupProviderAvailability,
  TELEGRAM_DANA_TOPUP_METHOD,
  TELEGRAM_JAGO_TOPUP_METHOD,
  walletTopupAmountCallback,
  walletTopupEntryStep,
  walletTopupJagoInvoice,
  walletTopupProviderLabel,
  walletTopupQrisInvoice,
  walletTopupProviderCallback,
} from "@/server/telegram/flows/payment/wallet-topup-presentation";
import { adminWalletTopupProviderLabel } from "@/server/admin/wallet-topups";

function methods(
  overrides: Partial<PaymentMethodAvailability> = {},
): PaymentMethodAvailability {
  return {
    qrisDanaEnabled: true,
    walletCheckoutEnabled: true,
    mixedWalletQrisEnabled: false,
    walletTopupEnabled: true,
    usdtBep20Enabled: false,
    binanceInternalEnabled: false,
    jagoTransferEnabled: true,
    updatedAt: null,
    updatedBy: null,
    ...overrides,
  };
}

describe("Telegram wallet top-up flow presentation", () => {
  it("asks for a provider when QRIS and Bank Jago are both ready", () => {
    const availability = resolveWalletTopupProviderAvailability({
      paymentMethods: methods(),
      qrisReady: true,
      jagoReady: true,
    });

    expect(availability.providers).toEqual([
      TELEGRAM_DANA_TOPUP_METHOD,
      TELEGRAM_JAGO_TOPUP_METHOD,
    ]);
    expect(walletTopupEntryStep(availability)).toEqual({ kind: "provider" });
  });

  it("goes directly to amount selection when only Bank Jago is ready", () => {
    const availability = resolveWalletTopupProviderAvailability({
      paymentMethods: methods({ qrisDanaEnabled: false }),
      qrisReady: true,
      jagoReady: true,
    });

    expect(walletTopupEntryStep(availability)).toEqual({
      kind: "amount",
      paymentMethod: TELEGRAM_JAGO_TOPUP_METHOD,
    });
  });

  it("hides top up unless wallet checkout, top up, and one provider are ready", () => {
    const availability = resolveWalletTopupProviderAvailability({
      paymentMethods: methods({
        qrisDanaEnabled: false,
        jagoTransferEnabled: false,
      }),
      qrisReady: false,
      jagoReady: false,
    });

    expect(walletTopupEntryStep(availability)).toEqual({ kind: "unavailable" });
  });

  it("round-trips provider-aware callbacks and keeps legacy DANA callbacks", () => {
    const provider = walletTopupProviderCallback(TELEGRAM_JAGO_TOPUP_METHOD);
    const amount = walletTopupAmountCallback(TELEGRAM_JAGO_TOPUP_METHOD, 25_000);

    expect(parseWalletTopupProviderCallback(provider)).toBe(TELEGRAM_JAGO_TOPUP_METHOD);
    expect(parseWalletTopupAmountCallback(amount)).toEqual({
      paymentMethod: TELEGRAM_JAGO_TOPUP_METHOD,
      amount: 25_000,
      legacy: false,
    });
    expect(parseWalletTopupAmountCallback("topup:25000")).toEqual({
      paymentMethod: TELEGRAM_DANA_TOPUP_METHOD,
      amount: 25_000,
      legacy: true,
    });
  });

  it("renders a Bank Jago invoice with copyable raw account and amount", () => {
    const invoice = walletTopupJagoInvoice({
      locale: "id",
      invoiceNumber: "TOP-20260822-TEST",
      baseAmount: 25_000,
      uniqueCode: 91,
      billedAmount: 25_091,
      recipientAccountNumber: "109331259936",
      expiresAt: new Date("2026-08-22T12:00:00.000Z"),
    });

    expect(invoice.text).toContain("Bank Jago");
    expect(invoice.text).not.toContain("QRIS");
    expect(invoice.replyMarkup.inline_keyboard[0]).toEqual([
      {
        text: "📋 Salin rekening",
        copy_text: { text: "109331259936" },
      },
      {
        text: "📋 Salin nominal",
        copy_text: { text: "25091" },
      },
    ]);
    expect(invoice.replyMarkup.inline_keyboard[1]).toEqual([{
      text: "⬅️ Kembali ke wallet",
      callback_data: "wallet_keep_invoice",
    }]);
  });

  it("labels the active Shopee QRIS provider instead of calling it DANA", () => {
    const availability = resolveWalletTopupProviderAvailability({
      paymentMethods: methods({ jagoTransferEnabled: false }),
      qrisReady: true,
      qrisProviderKey: "SHOPEE_PARTNER",
      jagoReady: false,
    });

    expect(walletTopupProviderLabel("id", TELEGRAM_DANA_TOPUP_METHOD, availability.qrisProviderKey))
      .toBe("QRIS ShopeePay");
    expect(adminWalletTopupProviderLabel({
      paymentMethod: TELEGRAM_DANA_TOPUP_METHOD,
      qrisProviderKey: availability.qrisProviderKey,
    })).toBe("QRIS ShopeePay");
  });

  it("adds a targeted refresh button only to pending Shopee top-up invoices", () => {
    const invoice = walletTopupQrisInvoice({
      locale: "id",
      invoiceNumber: "TOP-20260908-SHOPEE",
      baseAmount: 10_000,
      uniqueCode: 47,
      billedAmount: 10_047,
      expiresAt: new Date("2026-09-08T12:00:00.000Z"),
      providerKey: "SHOPEE_PARTNER",
      evidenceMode: "WEB_SESSION",
      status: "PENDING",
    });

    expect(invoice.replyMarkup.inline_keyboard[0]).toEqual([{
      text: "Refresh pembayaran Shopee",
      callback_data: "shopee_topup_refresh:TOP-20260908-SHOPEE",
      style: "primary",
    }]);

    const danaInvoice = walletTopupQrisInvoice({
      locale: "id",
      invoiceNumber: "TOP-20260908-DANA",
      baseAmount: 10_000,
      uniqueCode: 47,
      billedAmount: 10_047,
      expiresAt: new Date("2026-09-08T12:00:00.000Z"),
      providerKey: "DANA",
      evidenceMode: "ANDROID_NOTIFICATION",
      status: "PENDING",
    });
    expect(danaInvoice.replyMarkup.inline_keyboard[0]).toEqual([{
      text: "⬅️ Kembali ke wallet",
      callback_data: "wallet_keep_invoice",
    }]);
  });
});
