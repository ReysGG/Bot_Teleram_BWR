import type { TelegramLocale } from "@/server/telegram/i18n";
import type { InlineKeyboard } from "@/server/telegram/api";
import { formatRupiah } from "@/server/utils/format";

export type JagoTransferPublicStatus =
  | "AWAITING_TRANSFER"
  | "CONFIRMED"
  | "EXPIRED"
  | "CANCELLED";

function expiryText(locale: TelegramLocale, value: Date): string {
  return value.toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: "Asia/Jakarta",
  });
}

export function jagoTransferPaymentOptionLabel(locale: TelegramLocale): string {
  return locale === "en" ? "🏦 Bank Jago transfer" : "🏦 Transfer Bank Jago";
}

export function jagoTransferCopyButtonRow(input: {
  locale: TelegramLocale;
  recipientAccountNumber: string;
  billedAmount: number;
}): InlineKeyboard["inline_keyboard"][number] {
  return [
    {
      text: input.locale === "en" ? "📋 Copy account" : "📋 Salin rekening",
      copy_text: { text: input.recipientAccountNumber },
    },
    {
      text: input.locale === "en" ? "📋 Copy amount" : "📋 Salin nominal",
      copy_text: { text: String(input.billedAmount) },
    },
  ];
}

export function jagoTransferInvoiceText(input: {
  locale: TelegramLocale;
  invoiceNumber: string;
  productName: string;
  quantity: number;
  billedAmount: number;
  recipientAccountNumber: string;
  expiresAt: Date;
}): string {
  if (input.locale === "en") {
    return [
      "🏦 Bank Jago Transfer",
      "",
      `🧾 Invoice: ${input.invoiceNumber}`,
      `🛒 Product: ${input.productName}`,
      `📦 Quantity: ${input.quantity}`,
      `💵 Exact amount: ${formatRupiah(input.billedAmount)}`,
      `🏦 Bank: Bank Jago`,
      `🔢 Account number: ${input.recipientAccountNumber}`,
      `⏰ Expires: ${expiryText(input.locale, input.expiresAt)}`,
      "",
      "Transfer the exact amount above. The unique amount is required for automatic matching.",
      "The bot processes the order automatically after the Bank Jago incoming-transfer notification is verified.",
    ].join("\n");
  }
  return [
    "🏦 Transfer Bank Jago",
    "",
    `🧾 Invoice: ${input.invoiceNumber}`,
    `🛒 Produk: ${input.productName}`,
    `📦 Jumlah: ${input.quantity}`,
    `💵 Nominal tepat: ${formatRupiah(input.billedAmount)}`,
    `🏦 Bank: Bank Jago`,
    `🔢 Nomor rekening: ${input.recipientAccountNumber}`,
    `⏰ Batas bayar: ${expiryText(input.locale, input.expiresAt)}`,
    "",
    "Transfer sesuai nominal tepat di atas. Kode unik diperlukan agar pembayaran terdeteksi otomatis.",
    "Order diproses otomatis setelah notifikasi transfer masuk Bank Jago berhasil diverifikasi.",
  ].join("\n");
}

export function jagoTransferStatusText(input: {
  locale: TelegramLocale;
  status: JagoTransferPublicStatus;
}): string {
  const copy = input.locale === "en"
    ? {
        AWAITING_TRANSFER: "⏳ Waiting for the incoming Bank Jago transfer notification.",
        CONFIRMED: "✅ Bank Jago payment verified. Thank you for your purchase!",
        EXPIRED: "⌛ This Bank Jago invoice has expired.",
        CANCELLED: "❌ This Bank Jago payment was cancelled.",
      }
    : {
        AWAITING_TRANSFER: "⏳ Menunggu notifikasi transfer masuk dari Bank Jago.",
        CONFIRMED: "✅ Pembayaran Bank Jago terverifikasi. Terima kasih sudah membeli!",
        EXPIRED: "⌛ Invoice Bank Jago ini sudah kedaluwarsa.",
        CANCELLED: "❌ Pembayaran Bank Jago ini sudah dibatalkan.",
      };
  return copy[input.status];
}
