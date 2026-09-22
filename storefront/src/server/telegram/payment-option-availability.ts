import type { PaymentMethodAvailability } from "@/server/payment/method-availability";
import type { TelegramLocale } from "@/server/telegram/i18n";

export type TelegramPaymentOptionInput = {
  locale?: TelegramLocale;
  checkoutAllowed: boolean;
  walletBalance: number;
  subtotal: number;
  paymentMethods: PaymentMethodAvailability;
  qrisReady: boolean;
  usdtBep20Ready: boolean;
  binanceInternalReady: boolean;
  jagoTransferReady: boolean;
};

export function resolveTelegramPaymentOptions(input: TelegramPaymentOptionInput) {
  const canUseBalance = input.walletBalance >= input.subtotal;
  const canCombineBalance = input.walletBalance > 0 && input.walletBalance < input.subtotal;
  const wallet = input.checkoutAllowed && input.paymentMethods.walletCheckoutEnabled && canUseBalance;
  const mixed = input.checkoutAllowed &&
    input.paymentMethods.walletCheckoutEnabled &&
    input.paymentMethods.qrisDanaEnabled &&
    input.qrisReady &&
    input.paymentMethods.mixedWalletQrisEnabled &&
    canCombineBalance;
  const qris =
    input.checkoutAllowed && input.paymentMethods.qrisDanaEnabled && input.qrisReady;
  const usdtBep20 = input.checkoutAllowed && input.usdtBep20Ready;
  const binanceInternal = input.checkoutAllowed && input.binanceInternalReady;
  const jagoTransfer = input.checkoutAllowed && input.jagoTransferReady;
  const topup = input.checkoutAllowed &&
    input.paymentMethods.walletCheckoutEnabled &&
    input.paymentMethods.walletTopupEnabled &&
    ((input.paymentMethods.qrisDanaEnabled && input.qrisReady) ||
      input.jagoTransferReady) &&
    !canUseBalance &&
    !mixed;
  const hasPaymentOption = wallet || mixed || qris || usdtBep20 || binanceInternal || jagoTransfer;
  const prompt = input.locale === "en"
    ? !input.checkoutAllowed
      ? "Checkout is currently unavailable. Check the stock or maintenance status above."
      : hasPaymentOption
        ? "Choose a payment method:"
        : topup
          ? "Your balance is insufficient. Top up your wallet to continue."
          : input.paymentMethods.walletCheckoutEnabled && input.walletBalance < input.subtotal
            ? "Your wallet balance is insufficient and external payment methods are unavailable."
            : "All new payment methods are currently disabled by the admin."
    : !input.checkoutAllowed
    ? "Checkout belum dapat dilanjutkan. Periksa status stok atau maintenance di atas."
    : hasPaymentOption
      ? "Pilih metode pembayaran:"
      : topup
        ? "Saldo belum cukup. Top up wallet untuk melanjutkan pembelian."
        : input.paymentMethods.walletCheckoutEnabled && input.walletBalance < input.subtotal
          ? "Saldo wallet belum cukup dan metode pembayaran eksternal sedang nonaktif."
        : "Semua metode pembayaran baru sedang dinonaktifkan admin.";

  return {
    wallet,
    mixed,
    topup,
    qris,
    usdtBep20,
    binanceInternal,
    jagoTransfer,
    hasPaymentOption,
    prompt,
  };
}
