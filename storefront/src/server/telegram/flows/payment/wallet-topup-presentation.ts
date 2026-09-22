import type { PaymentMethodAvailability } from "@/server/payment/method-availability";
import type { InlineKeyboard } from "@/server/telegram/api";
import type { TelegramLocale } from "@/server/telegram/i18n";
import { formatRupiah } from "@/server/utils/format";
import { jagoTransferCopyButtonRow } from "./jago-transfer-presentation";

export const TELEGRAM_DANA_TOPUP_METHOD = "DANA_RELAY" as const;
export const TELEGRAM_JAGO_TOPUP_METHOD = "JAGO_TRANSFER" as const;

export type TelegramWalletTopupMethod =
  | typeof TELEGRAM_DANA_TOPUP_METHOD
  | typeof TELEGRAM_JAGO_TOPUP_METHOD;

export type WalletTopupProviderAvailability = {
  dana: boolean;
  jago: boolean;
  providers: TelegramWalletTopupMethod[];
  qrisProviderKey: string | null;
};

export function resolveWalletTopupProviderAvailability(input: {
  paymentMethods: PaymentMethodAvailability;
  qrisReady: boolean;
  qrisProviderKey?: string | null;
  jagoReady: boolean;
}): WalletTopupProviderAvailability {
  const enabled = input.paymentMethods.walletCheckoutEnabled &&
    input.paymentMethods.walletTopupEnabled;
  const dana = enabled && input.paymentMethods.qrisDanaEnabled && input.qrisReady;
  const jago = enabled &&
    input.paymentMethods.jagoTransferEnabled &&
    input.jagoReady;
  return {
    dana,
    jago,
    providers: [
      ...(dana ? [TELEGRAM_DANA_TOPUP_METHOD] : []),
      ...(jago ? [TELEGRAM_JAGO_TOPUP_METHOD] : []),
    ],
    qrisProviderKey: input.qrisProviderKey ?? null,
  };
}

export function walletTopupEntryStep(
  availability: WalletTopupProviderAvailability,
):
  | { kind: "unavailable" }
  | { kind: "provider" }
  | { kind: "amount"; paymentMethod: TelegramWalletTopupMethod } {
  if (availability.providers.length === 0) return { kind: "unavailable" };
  if (availability.providers.length === 1) {
    return { kind: "amount", paymentMethod: availability.providers[0]! };
  }
  return { kind: "provider" };
}

export function walletTopupProviderCallback(
  paymentMethod: TelegramWalletTopupMethod,
): string {
  return `topup_provider:${paymentMethod}`;
}

export function parseWalletTopupProviderCallback(
  value: string,
): TelegramWalletTopupMethod | null {
  const match = /^topup_provider:(DANA_RELAY|JAGO_TRANSFER)$/.exec(value);
  return match?.[1] as TelegramWalletTopupMethod | undefined ?? null;
}

export function walletTopupAmountCallback(
  paymentMethod: TelegramWalletTopupMethod,
  amount: number,
): string {
  return `topup:${paymentMethod}:${amount}`;
}

export function parseWalletTopupAmountCallback(value: string): {
  paymentMethod: TelegramWalletTopupMethod;
  amount: number;
  legacy: boolean;
} | null {
  const providerAware = /^topup:(DANA_RELAY|JAGO_TRANSFER):(\d+)$/.exec(value);
  if (providerAware) {
    return {
      paymentMethod: providerAware[1] as TelegramWalletTopupMethod,
      amount: Number.parseInt(providerAware[2]!, 10),
      legacy: false,
    };
  }
  const legacy = /^topup:(\d+)$/.exec(value);
  if (!legacy) return null;
  return {
    paymentMethod: TELEGRAM_DANA_TOPUP_METHOD,
    amount: Number.parseInt(legacy[1]!, 10),
    legacy: true,
  };
}

export function walletTopupProviderLabel(
  locale: TelegramLocale,
  paymentMethod: TelegramWalletTopupMethod,
  qrisProviderKey?: string | null,
): string {
  if (paymentMethod === TELEGRAM_JAGO_TOPUP_METHOD) {
    return locale === "en" ? "Bank Jago transfer" : "Transfer Bank Jago";
  }
  if (qrisProviderKey === "SHOPEE_PARTNER") {
    return locale === "en" ? "ShopeePay QRIS" : "QRIS ShopeePay";
  }
  return locale === "en" ? "QRIS / DANA" : "QRIS / DANA";
}

export function walletTopupQrisInvoice(input: {
  locale: TelegramLocale;
  invoiceNumber: string;
  baseAmount: number;
  uniqueCode: number;
  billedAmount: number;
  expiresAt: Date;
  providerKey: string;
  evidenceMode?: string;
  status?: string;
  notice?: string;
}): { text: string; replyMarkup: InlineKeyboard } {
  const expiresAt = input.expiresAt.toLocaleString(
    input.locale === "en" ? "en-GB" : "id-ID",
    { timeZone: "Asia/Jakarta" },
  );
  const providerLabel = walletTopupProviderLabel(
    input.locale,
    TELEGRAM_DANA_TOPUP_METHOD,
    input.providerKey,
  );
  const english = input.locale === "en";
  const text = [
    ...(input.notice ? [input.notice, ""] : []),
    english ? "➕ Wallet top-up invoice" : "➕ Invoice top up saldo",
    "",
    `🧾 ${input.invoiceNumber}`,
    `💰 ${english ? "Wallet credit" : "Saldo masuk"}: ${formatRupiah(input.baseAmount)}`,
    `🔢 ${english ? "Unique code" : "Kode unik"}: ${formatRupiah(input.uniqueCode)}`,
    `💳 ${english ? "Exact payment" : "Total bayar"}: ${formatRupiah(input.billedAmount)}`,
    `🏦 ${english ? "Method" : "Metode"}: ${providerLabel}`,
    `⏰ ${english ? "Expires" : "Batas bayar"}: ${expiresAt}`,
    "",
    english
      ? "Pay the exact amount. The unique code is only used for matching and is not credited to the wallet."
      : "Bayar nominal tepat. Kode unik hanya untuk pencocokan dan tidak masuk ke saldo.",
  ].join("\n");
  const pendingShopee = input.providerKey === "SHOPEE_PARTNER" &&
    input.evidenceMode === "WEB_SESSION" &&
    input.status === "PENDING";
  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        ...(pendingShopee
          ? [[{
              text: english ? "Refresh Shopee payment" : "Refresh pembayaran Shopee",
              callback_data: `shopee_topup_refresh:${input.invoiceNumber}`,
              style: "primary" as const,
            }]]
          : []),
        [{
          text: english ? "⬅️ Back to wallet" : "⬅️ Kembali ke wallet",
          callback_data: "wallet_keep_invoice",
        }],
      ],
    },
  };
}

export function walletTopupJagoInvoice(input: {
  locale: TelegramLocale;
  invoiceNumber: string;
  baseAmount: number;
  uniqueCode: number;
  billedAmount: number;
  recipientAccountNumber: string;
  expiresAt: Date;
}): { text: string; replyMarkup: InlineKeyboard } {
  const expiresAt = input.expiresAt.toLocaleString(
    input.locale === "en" ? "en-GB" : "id-ID",
    { timeZone: "Asia/Jakarta" },
  );
  const text = input.locale === "en"
    ? [
        "➕ Wallet top-up invoice",
        "",
        `🧾 ${input.invoiceNumber}`,
        `💰 Wallet credit: ${formatRupiah(input.baseAmount)}`,
        `🔢 Unique code: ${formatRupiah(input.uniqueCode)}`,
        `💳 Exact transfer: ${formatRupiah(input.billedAmount)}`,
        "🏦 Bank: Bank Jago",
        `🔢 Account number: ${input.recipientAccountNumber}`,
        `⏰ Expires: ${expiresAt}`,
        "",
        "Transfer the exact amount. The unique code is only used for automatic matching and is not credited to the wallet.",
      ].join("\n")
    : [
        "➕ Invoice top up saldo",
        "",
        `🧾 ${input.invoiceNumber}`,
        `💰 Saldo masuk: ${formatRupiah(input.baseAmount)}`,
        `🔢 Kode unik: ${formatRupiah(input.uniqueCode)}`,
        `💳 Transfer tepat: ${formatRupiah(input.billedAmount)}`,
        "🏦 Bank: Bank Jago",
        `🔢 Nomor rekening: ${input.recipientAccountNumber}`,
        `⏰ Batas bayar: ${expiresAt}`,
        "",
        "Transfer sesuai nominal tepat. Kode unik hanya untuk pencocokan otomatis dan tidak masuk ke saldo.",
      ].join("\n");
  return {
    text,
    replyMarkup: {
      inline_keyboard: [
        jagoTransferCopyButtonRow({
          locale: input.locale,
          recipientAccountNumber: input.recipientAccountNumber,
          billedAmount: input.billedAmount,
        }),
        [{
          text: input.locale === "en" ? "⬅️ Back to wallet" : "⬅️ Kembali ke wallet",
          callback_data: "wallet_keep_invoice",
        }],
      ],
    },
  };
}
