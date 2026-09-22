import { formatRupiah } from "@/server/utils/format";
import type { TelegramLocale } from "@/server/telegram/i18n";

const PRODUCT_EMOJI_RULES: Array<{ pattern: RegExp; emoji: string }> = [
  { pattern: /claude|anthropic/i, emoji: "🧠" },
  { pattern: /chatgpt|openai|gpt\b/i, emoji: "🤖" },
  { pattern: /codex/i, emoji: "⌨️" },
  { pattern: /gemini|google ai/i, emoji: "✨" },
  { pattern: /canva|design/i, emoji: "🎨" },
  { pattern: /sms|otp|nomor/i, emoji: "📲" },
  { pattern: /json|akun|account/i, emoji: "📄" },
];

export function productEmoji(productName: string) {
  return PRODUCT_EMOJI_RULES.find((rule) => rule.pattern.test(productName))?.emoji ?? "🧩";
}

export function productDisplayName(productName: string) {
  const cleanName = productName.trim() || "Produk digital";
  if (/^[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u.test(cleanName)) {
    return cleanName;
  }
  // Keep dense Telegram lists readable; custom brand emoji are applied by the
  // message formatter when configured, so a second text prefix is redundant.
  return cleanName;
}

export function paymentSuccessMessage(input: {
  invoiceNumber: string;
  quantity: number;
  grandTotal: number;
  isPreorder: boolean;
  preorderEtaText?: string | null;
  locale?: TelegramLocale;
}) {
  const english = input.locale === "en";
  return [
    english ? "Payment received" : "Pembayaran diterima",
    "",
    `Invoice: ${input.invoiceNumber}`,
    `${english ? "Quantity" : "Jumlah"}: ${input.quantity} item`,
    `${english ? "Total" : "Total"}: ${formatRupiah(input.grandTotal)}`,
    "",
    ...(input.isPreorder
      ? [
          english
          ? "Preorder has entered the queue."
            : "Preorder kamu sudah masuk antrean.",
          `${english ? "Estimate" : "Estimasi"}: ${input.preorderEtaText ?? (english ? "will be provided by admin" : "akan diinformasikan admin")}`,
          english
            ? "The product will be delivered automatically when stock is available."
            : "Produk akan dikirim otomatis saat stok tersedia.",
        ]
      : [english
          ? "Your product is being prepared and will be delivered in this chat shortly."
          : "Produk sedang disiapkan dan akan segera dikirim di chat ini."]),
  ].join("\n");
}

export function digitalDeliveryCaption(input: {
  productName: string;
  invoiceNumber: string;
  unitNumber: number;
  totalUnits: number;
  locale?: TelegramLocale;
}) {
  const english = input.locale === "en";
  return [
    english ? "Product file" : "File produk",
    productDisplayName(input.productName),
    `${english ? "File" : "File"} ${input.unitNumber}/${input.totalUnits}`,
    `Invoice: ${input.invoiceNumber}`,
    "",
    english ? "Keep this file secure." : "Simpan file ini dengan aman.",
  ].join("\n");
}

export function groupedDeliveryCaption(input: {
  productNames: string[];
  invoiceNumber: string;
  quantity: number;
  format: "K12" | "TEXT" | "ZIP";
  locale?: TelegramLocale;
  unitStart?: number;
  unitEnd?: number;
  totalUnits?: number;
}) {
  const products = [...new Set(input.productNames)].map(productDisplayName).join(", ");
  const english = input.locale === "en";
  const unitStart = input.unitStart ?? 1;
  const unitEnd = input.unitEnd ?? input.quantity;
  const totalUnits = input.totalUnits ?? input.quantity;
  const showBatchRange = unitStart !== 1 || unitEnd !== totalUnits;
  return [
    english
      ? "Product file"
      : "File produk",
    products,
    `${english ? "Quantity" : "Jumlah"}: ${input.quantity} ${english ? "items in 1 file" : "item dalam 1 file"}`,
    ...(showBatchRange
      ? [`${english ? "Batch" : "Bagian"}: ${unitStart}-${unitEnd} / ${totalUnits}`]
      : []),
    `Invoice: ${input.invoiceNumber}`,
    "",
    input.format === "K12"
      ? english
        ? "The file is ready to import through Bulk Add Codex Accounts in 9Router."
        : "File siap di-import melalui Bulk Add Codex Accounts di 9Router."
      : input.format === "TEXT"
        ? english
          ? "All TXT items are combined for easier storage."
          : "Semua item TXT sudah digabung agar lebih mudah disimpan."
        : english
          ? "All product files are combined in one ZIP archive."
          : "Semua file produk sudah digabung dalam satu arsip ZIP.",
  ].join("\n");
}
