import { formatUsdtMicros, formatUsdtMicrosForInput } from "@/server/payment/usdt-amount";
import type { InlineKeyboard } from "@/server/telegram/api";
import type { TelegramLocale } from "@/server/telegram/i18n";

export type BinanceInternalPublicStatus =
  | "AWAITING_ORDER_ID"
  | "VERIFYING"
  | "VERIFIED"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED";

export type BinanceInternalButtonKey =
  | "transferred"
  | "refresh"
  | "order"
  | "cancel"
  | "backPayment"
  | "backCatalog"
  | "backOrders";

function expiryText(locale: TelegramLocale, value: Date): string {
  return value.toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: "Asia/Jakarta",
  });
}

export function binanceInternalPaymentOptionLabel(locale: TelegramLocale): string {
  return locale === "en"
    ? "Binance Pay (Binance-to-Binance)"
    : "Binance Pay (Binance-to-Binance)";
}

export function binanceInternalCopyButtons(input: {
  locale: TelegramLocale;
  recipientBinanceId: string;
  amountUsdtMicros: number;
}): InlineKeyboard["inline_keyboard"][number] {
  return [
    {
      text: input.locale === "en" ? "📋 Copy Binance ID" : "📋 Salin Binance ID",
      copy_text: { text: input.recipientBinanceId },
    },
    {
      text: input.locale === "en" ? "💵 Copy amount" : "💵 Salin nominal",
      copy_text: {
        text: formatUsdtMicrosForInput(input.amountUsdtMicros),
      },
    },
  ];
}

export function binanceInternalButtonText(
  locale: TelegramLocale,
  key: BinanceInternalButtonKey,
): string {
  const copy = locale === "en"
    ? {
        transferred: "✅ I have paid",
        refresh: "🔄 Check payment",
        order: "📦 View order",
        cancel: "❌ Cancel payment",
        backPayment: "⬅️ Back to payment",
        backCatalog: "⬅️ Back to catalog",
        backOrders: "⬅️ My orders",
      }
    : {
        transferred: "✅ Saya sudah bayar",
        refresh: "🔄 Cek pembayaran",
        order: "📦 Lihat order",
        cancel: "❌ Batalkan pembayaran",
        backPayment: "⬅️ Kembali ke pembayaran",
        backCatalog: "⬅️ Kembali ke katalog",
        backOrders: "⬅️ Order saya",
      };
  return copy[key];
}

export function binanceInternalInvoiceText(input: {
  locale: TelegramLocale;
  invoiceNumber: string;
  productName: string;
  quantity: number;
  amountUsdtMicros: number;
  recipientBinanceId: string;
  expiresAt: Date;
}): string {
  if (input.locale === "en") {
    return [
      "Binance Pay (Binance-to-Binance)",
      "",
      `🧾 Invoice: ${input.invoiceNumber}`,
      `🛒 Product: ${input.productName}`,
      `📦 Quantity: ${input.quantity}`,
      `💵 Exact amount: ${formatUsdtMicros(input.amountUsdtMicros)}`,
      `🏦 Recipient Binance ID: ${input.recipientBinanceId}`,
      `⏰ Expires: ${expiryText(input.locale, input.expiresAt)}`,
      "",
      "Send the exact USDT amount through Binance Pay to the Binance ID above.",
      "Use an internal Binance transfer. Do not select the BSC/BEP20 network.",
      "After Binance shows Completed, tap ‘I have paid’ and enter the Order ID from Payment Details.",
      "Never send a password, OTP, recovery code, or screenshot.",
    ].join("\n");
  }
  return [
    "Binance Pay (Binance-to-Binance)",
    "",
    `🧾 Invoice: ${input.invoiceNumber}`,
    `🛒 Produk: ${input.productName}`,
    `📦 Jumlah: ${input.quantity}`,
    `💵 Nominal tepat: ${formatUsdtMicros(input.amountUsdtMicros)}`,
    `🏦 Binance ID penerima: ${input.recipientBinanceId}`,
    `⏰ Batas bayar: ${expiryText(input.locale, input.expiresAt)}`,
    "",
    "Kirim nominal USDT yang tepat melalui Binance Pay ke Binance ID di atas.",
    "Gunakan transfer internal Binance. Jangan pilih jaringan BSC/BEP20.",
    "Setelah status Binance Completed, tekan ‘Saya sudah bayar’ lalu masukkan Order ID dari Payment Details.",
    "Jangan pernah mengirim password, OTP, kode pemulihan, atau screenshot.",
  ].join("\n");
}

export function binanceInternalOrderIdPromptText(
  locale: TelegramLocale,
  invoiceNumber: string,
): string {
  return locale === "en"
    ? [
        "🔎 Enter Binance Pay Order ID",
        "",
        `🧾 Invoice: ${invoiceNumber}`,
        "Open Binance Payment Details, copy the Order ID, then send it here as text.",
        "Example: 448515289526009856",
        "Do not send the recipient Binance ID, password, OTP, or screenshot.",
      ].join("\n")
    : [
        "🔎 Masukkan Order ID Binance Pay",
        "",
        `🧾 Invoice: ${invoiceNumber}`,
        "Buka Payment Details di Binance, salin Order ID, lalu kirim ke sini sebagai teks.",
        "Contoh: 448515289526009856",
        "Jangan kirim Binance ID penerima, password, OTP, atau screenshot.",
      ].join("\n");
}

export function binanceInternalStatusText(input: {
  locale: TelegramLocale;
  status: BinanceInternalPublicStatus;
  submittedOrderId?: string | null;
}): string {
  const idLine = input.submittedOrderId
    ? `🔗 Order ID: ${input.submittedOrderId}`
    : null;
  const copy = input.locale === "en"
    ? {
        AWAITING_ORDER_ID: "⏳ Waiting for your Binance Pay Order ID.",
        VERIFYING: "🔎 The incoming Binance transaction is being verified.",
        VERIFIED: "✅ The Binance transaction is valid. Finalizing your order.",
        CONFIRMED: "✅ Binance payment verified. Thank you for your purchase!",
        REJECTED: "❌ This Order ID does not match the invoice. Check the recipient, amount, time, and Order ID.",
        EXPIRED: "⌛ This Binance Pay invoice has expired.",
      }
    : {
        AWAITING_ORDER_ID: "⏳ Menunggu Order ID Binance Pay dari kamu.",
        VERIFYING: "🔎 Transaksi masuk Binance sedang diverifikasi.",
        VERIFIED: "✅ Transaksi Binance valid. Order sedang diselesaikan.",
        CONFIRMED: "✅ Pembayaran Binance terverifikasi. Terima kasih sudah membeli!",
        REJECTED: "❌ Order ID tidak sesuai dengan invoice. Periksa penerima, nominal, waktu, dan Order ID.",
        EXPIRED: "⌛ Invoice Binance Pay ini sudah kedaluwarsa.",
      };
  return [copy[input.status], ...(idLine ? [idLine] : [])].join("\n");
}

export function binanceInternalLocksCancellation(
  status: BinanceInternalPublicStatus | null | undefined,
): boolean {
  return status === "VERIFYING" || status === "VERIFIED" || status === "CONFIRMED";
}

export function binanceInternalPublicErrorText(
  locale: TelegramLocale,
  code: string,
): string {
  const indonesian: Record<string, string> = {
    INVALID_ORDER_ID: "Format Order ID Binance tidak valid.",
    ORDER_ID_ALREADY_USED: "Order ID Binance tersebut sudah digunakan untuk order lain.",
    ORDER_ID_ALREADY_SUBMITTED: "Order ID untuk invoice ini sudah pernah dikirim.",
    ATTEMPT_EXPIRED: "Batas waktu pengiriman Order ID sudah berakhir.",
    ORDER_NOT_FOUND: "Order Binance Pay tidak ditemukan.",
    ATTEMPT_NOT_FOUND: "Instruksi pembayaran Binance Pay tidak ditemukan.",
  };
  const english: Record<string, string> = {
    INVALID_ORDER_ID: "The Binance Order ID format is invalid.",
    ORDER_ID_ALREADY_USED: "This Binance Order ID has already been used for another order.",
    ORDER_ID_ALREADY_SUBMITTED: "An Order ID has already been submitted for this invoice.",
    ATTEMPT_EXPIRED: "The Order ID submission window has expired.",
    ORDER_NOT_FOUND: "The Binance Pay order was not found.",
    ATTEMPT_NOT_FOUND: "The Binance Pay instructions were not found.",
  };
  const copy = locale === "en" ? english : indonesian;
  return copy[code] ?? (locale === "en"
    ? "The Binance payment could not be processed yet. Check the order status."
    : "Pembayaran Binance belum dapat diproses. Periksa kembali status order.");
}
