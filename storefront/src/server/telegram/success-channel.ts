import { optionalEnv } from "@/server/env";
import { productDisplayName } from "@/server/telegram/product-presentation";
import { formatRupiah } from "@/server/utils/format";

export function successChannelId() {
  return optionalEnv("TELEGRAM_SUCCESS_CHANNEL_ID");
}

export function successChannelUrl() {
  return optionalEnv("TELEGRAM_SUCCESS_CHANNEL_URL") ?? "https://t.me/bwrtele_success";
}

export function successChannelSmsOrderId(dedupeKey: string) {
  const prefix = "success-channel:sms:";
  const orderId = dedupeKey.startsWith(prefix) ? dedupeKey.slice(prefix.length).trim() : "";
  return orderId && !/[\s:/]/.test(orderId) ? orderId : null;
}

export function telegramStoreBotUrl() {
  const username = optionalEnv("TELEGRAM_BOT_USERNAME")?.replace(/^@/, "") || "K12JsonStockBot";
  return `https://t.me/${username}`;
}

export function safePublicLabel(value: string | null | undefined, fallback: string) {
  const normalized = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  const looksSensitive =
    /\b(?:access|refresh|id)[-_ ]?token\b|\bpassword\b|\bpasswd\b|\bsecret\b|\bauthorization\b|\bbearer\b|\bapi[-_ ]?key\b|\bclient[-_ ]?secret\b/i.test(
      normalized,
    ) ||
    /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/.test(normalized) ||
    /\b(?:eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{10,}|[a-f0-9]{32,}|[A-Za-z0-9_-]{48,})\b/i.test(
      normalized,
    );
  if (looksSensitive) return fallback;
  return normalized || fallback;
}

export function maskBuyer(value?: string | null) {
  const clean = safePublicLabel(value?.replace(/^@/, ""), "User");
  if (clean.length <= 2) return `${clean[0] ?? "U"}***`;
  return `${clean.slice(0, 2)}***`;
}

export function storefrontPublicUrl(value?: string) {
  const raw = value ?? optionalEnv("STOREFRONT_PUBLIC_URL") ?? "https://store.buildwithreys.com";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || raw.length > 2048) throw new Error("STOREFRONT_PUBLIC_URL must be a public HTTPS URL without credentials, query or fragment");
  return url.href.replace(/\/$/, "");
}

export function digitalPurchaseSuccessMessage(input: {
  buyer?: string | null;
  productNames: string[];
  total: number;
  quantity: number;
  channel?: "WEB" | "TELEGRAM";
  websiteUrl?: string;
}) {
  const names = input.productNames.map(name => safePublicLabel(name, "Produk digital")).map(productDisplayName);
  const web = input.channel === "WEB";
  return [
    "📦 Pesanan beres di BWR Tele",
    "",
    web ? "Produk digital sudah diambil pembeli." : "Produk digital sudah terkirim ke pembeli.",
    "",
    ...(web ? [] : [`👤 Pembeli: ${maskBuyer(input.buyer)}`]),
    `🛍 Produk: ${names.join(", ")}`,
    `🔢 Jumlah: ${input.quantity}x`,
    `💳 Total transaksi: ${formatRupiah(input.total)}`,
    web ? "🌐 Kanal pembelian: Website BWR Tele" : "💬 Kanal pembelian: Bot Telegram BWR Tele",
    ...(web ? [`🔗 ${storefrontPublicUrl(input.websiteUrl)}`] : []),
    "",
    "Terima kasih sudah belanja di BWR Tele.",
    "Semoga produknya membantu aktivitasmu!",
    "Sampai jumpa di pesanan berikutnya.",
    web ? "Kebutuhan digital berikutnya? Mampir ke website kami." : "Temukan kebutuhan digital berikutnya di katalog BWR Tele.",
  ].join("\n");
}

export function smsPurchaseSuccessMessage(input: {
  buyer?: string | null;
  serviceName: string;
  countryName: string;
  total: number;
}) {
  return [
    "🎉 PEMBELIAN SMS SUKSES 🎉",
    "",
    `👤 Pembeli: ${maskBuyer(input.buyer)}`,
    `📲 Layanan: ${safePublicLabel(input.serviceName, "Layanan OTP")}`,
    `🌍 Negara: ${safePublicLabel(input.countryName, "Negara")}`,
    `💰 Total: ${formatRupiah(input.total)}`,
    "🏪 Store: BWR Tele",
    "",
    "✨ OTP berhasil diterima.",
    "🛍️ Mau order juga? Chat bot sekarang.",
  ].join("\n");
}
