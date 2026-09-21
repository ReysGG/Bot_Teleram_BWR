import { formatUsdtMicros } from "@/server/payment/usdt-amount";
import type { TelegramLocale } from "@/server/telegram/i18n";

export type UsdtBep20PublicStatus =
  | "AWAITING_TX_HASH"
  | "VERIFYING"
  | "PENDING_CONFIRMATIONS"
  | "VERIFIED"
  | "CONFIRMED"
  | "REJECTED"
  | "EXPIRED";

export type UsdtBep20ButtonKey =
  | "transferred"
  | "refresh"
  | "order"
  | "cancel"
  | "backPayment"
  | "backCatalog"
  | "backOrders";

type InvoiceInput = {
  locale: TelegramLocale;
  invoiceNumber: string;
  productName: string;
  quantity: number;
  amountUsdtMicros: number;
  recipientAddress: string;
  expiresAt: Date;
};

function expiryText(locale: TelegramLocale, value: Date): string {
  return value.toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
    timeZone: "Asia/Jakarta",
  });
}

export function usdtBep20PaymentOptionLabel(locale: TelegramLocale): string {
  return locale === "en" ? "💵 USDT · BEP20" : "💵 USDT · BEP20";
}

export function usdtBep20ButtonText(
  locale: TelegramLocale,
  key: UsdtBep20ButtonKey,
): string {
  const copy = locale === "en"
    ? {
        transferred: "✅ I have transferred",
        refresh: "🔄 Refresh verification",
        order: "📦 View order",
        cancel: "❌ Cancel payment",
        backPayment: "⬅️ Back to payment",
        backCatalog: "⬅️ Back to catalog",
        backOrders: "⬅️ My orders",
      }
    : {
        transferred: "✅ Saya sudah transfer",
        refresh: "🔄 Refresh verifikasi",
        order: "📦 Lihat order",
        cancel: "❌ Batalkan pembayaran",
        backPayment: "⬅️ Kembali ke pembayaran",
        backCatalog: "⬅️ Kembali ke katalog",
        backOrders: "⬅️ Order saya",
      };
  return copy[key];
}

export function usdtBep20InvoiceText(input: InvoiceInput): string {
  if (input.locale === "en") {
    return [
      "💵 USDT Payment",
      "",
      `🧾 Invoice: ${input.invoiceNumber}`,
      `🛒 Product: ${input.productName}`,
      `📦 Quantity: ${input.quantity}`,
      `🌐 Network: BNB Smart Chain mainnet (BEP20)`,
      `💰 Exact amount: ${formatUsdtMicros(input.amountUsdtMicros)}`,
      `📬 Recipient: ${input.recipientAddress}`,
      "📷 QR: scan to fill the recipient address",
      `⏰ Expires: ${expiryText(input.locale, input.expiresAt)}`,
      "",
      "⚠️ Send USDT using BEP20 only. Do not use another network or send another token.",
      "The QR contains the recipient address only. Enter the exact amount shown above manually.",
      "The received USDT amount must match the exact amount above; network fees are paid separately.",
      "After the transfer, tap ‘I have transferred’ and submit the transaction hash.",
    ].join("\n");
  }

  return [
    "💵 Pembayaran USDT",
    "",
    `🧾 Invoice: ${input.invoiceNumber}`,
    `🛒 Produk: ${input.productName}`,
    `📦 Jumlah: ${input.quantity}`,
    `🌐 Jaringan: BNB Smart Chain mainnet (BEP20)`,
    `💰 Nominal tepat: ${formatUsdtMicros(input.amountUsdtMicros)}`,
    `📬 Penerima: ${input.recipientAddress}`,
    "📷 QR: scan untuk mengisi alamat penerima",
    `⏰ Batas bayar: ${expiryText(input.locale, input.expiresAt)}`,
    "",
    "⚠️ Kirim USDT melalui BEP20 saja. Jangan gunakan jaringan lain atau mengirim token lain.",
    "QR hanya berisi alamat penerima. Masukkan nominal tepat di atas secara manual.",
    "Nominal USDT yang diterima harus sama persis; biaya jaringan dibayar terpisah.",
    "Setelah transfer, tekan ‘Saya sudah transfer’ lalu kirim transaction hash.",
  ].join("\n");
}

export function usdtBep20HashPromptText(
  locale: TelegramLocale,
  invoiceNumber: string,
): string {
  return locale === "en"
    ? [
        "🔎 Submit transaction hash",
        "",
        `🧾 Invoice: ${invoiceNumber}`,
        "Paste the 0x transaction hash from your USDT BEP20 transfer.",
        "Example: 0x followed by 64 hexadecimal characters.",
        "Do not send an Order ID, wallet address, password, OTP, or screenshot.",
      ].join("\n")
    : [
        "🔎 Kirim transaction hash",
        "",
        `🧾 Invoice: ${invoiceNumber}`,
        "Tempel transaction hash 0x dari transfer USDT BEP20 kamu.",
        "Contoh: 0x diikuti 64 karakter heksadesimal.",
        "Jangan kirim Order ID, alamat wallet, password, OTP, atau screenshot.",
      ].join("\n");
}

export function usdtBep20StatusText(input: {
  locale: TelegramLocale;
  status: UsdtBep20PublicStatus;
  transactionHash?: string | null;
  confirmations?: number | null;
  requiredConfirmations?: number | null;
}): string {
  const hashLine = input.transactionHash
    ? input.locale === "en"
      ? `🔗 Transaction hash: ${input.transactionHash}`
      : `🔗 Transaction hash: ${input.transactionHash}`
    : null;
  const confirmations = Math.max(0, input.confirmations ?? 0);
  const requiredConfirmations = Math.max(1, input.requiredConfirmations ?? 1);
  const copy = input.locale === "en"
    ? {
        AWAITING_TX_HASH: "⏳ Waiting for your transaction hash.",
        VERIFYING: "🔎 The transaction is being checked on-chain.",
        PENDING_CONFIRMATIONS: `⏳ Transaction found. Confirmations ${confirmations}/${requiredConfirmations}.`,
        VERIFIED: "✅ The on-chain transfer is valid. Finalizing your payment.",
        CONFIRMED: "✅ USDT payment verified. Your order is being processed.",
        REJECTED: "❌ The transaction could not be verified for this invoice. Check the network, recipient, amount, and hash.",
        EXPIRED: "⌛ This USDT invoice has expired.",
      }
    : {
        AWAITING_TX_HASH: "⏳ Menunggu transaction hash dari kamu.",
        VERIFYING: "🔎 Transaksi sedang diperiksa secara on-chain.",
        PENDING_CONFIRMATIONS: `⏳ Transaksi ditemukan. Konfirmasi ${confirmations}/${requiredConfirmations}.`,
        VERIFIED: "✅ Transfer on-chain valid. Pembayaran sedang diselesaikan.",
        CONFIRMED: "✅ Pembayaran USDT terverifikasi. Order sedang diproses.",
        REJECTED: "❌ Transaksi belum dapat diverifikasi untuk invoice ini. Periksa jaringan, penerima, nominal, dan hash.",
        EXPIRED: "⌛ Invoice USDT ini sudah kedaluwarsa.",
      };
  return [copy[input.status], ...(hashLine ? [hashLine] : [])].join("\n");
}

export function usdtBep20LocksCancellation(
  status: UsdtBep20PublicStatus | null | undefined,
): boolean {
  return status === "VERIFYING" ||
    status === "PENDING_CONFIRMATIONS" ||
    status === "VERIFIED" ||
    status === "CONFIRMED";
}

export function usdtBep20PublicErrorText(
  locale: TelegramLocale,
  code: string,
): string {
  const indonesian: Record<string, string> = {
    INVALID_TX_HASH: "Hash transaksi harus diawali 0x dan berisi 64 digit heksadesimal.",
    TX_HASH_ALREADY_USED: "Hash transaksi tersebut sudah digunakan untuk order lain.",
    TX_HASH_ALREADY_SUBMITTED: "Hash transaksi untuk order ini sudah pernah dikirim.",
    ATTEMPT_EXPIRED: "Batas waktu pengiriman hash transaksi sudah berakhir.",
    ORDER_NOT_PENDING: "Order ini sudah tidak menunggu pembayaran.",
    ORDER_NOT_FOUND: "Order USDT BEP20 tidak ditemukan.",
    ATTEMPT_NOT_FOUND: "Instruksi pembayaran USDT BEP20 tidak ditemukan.",
  };
  const english: Record<string, string> = {
    INVALID_TX_HASH: "The transaction hash must start with 0x and contain 64 hexadecimal characters.",
    TX_HASH_ALREADY_USED: "This transaction hash has already been used for another order.",
    TX_HASH_ALREADY_SUBMITTED: "A transaction hash has already been submitted for this order.",
    ATTEMPT_EXPIRED: "The transaction-hash submission window has expired.",
    ORDER_NOT_PENDING: "This order is no longer waiting for payment.",
    ORDER_NOT_FOUND: "The USDT BEP20 order was not found.",
    ATTEMPT_NOT_FOUND: "The USDT BEP20 payment instructions were not found.",
  };
  const copy = locale === "en" ? english : indonesian;
  return copy[code] ?? (locale === "en"
    ? "The USDT payment could not be processed. Please check the order status."
    : "Pembayaran USDT belum dapat diproses. Periksa kembali status order.");
}
