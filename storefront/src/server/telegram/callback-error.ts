import { ActiveInvoiceError, ActiveInvoiceLimitError } from "@/server/checkout/errors";
import type { InlineKeyboard } from "@/server/telegram/api";
import type { TelegramLocale } from "@/server/telegram/i18n";

export function callbackErrorContent(error: unknown, locale: TelegramLocale): {
  text: string;
  replyMarkup: InlineKeyboard;
} {
  const english = locale === "en";
  if (error instanceof ActiveInvoiceLimitError) {
    return {
      text: english
        ? `You have ${error.limit} active invoices. Open My orders to pay or cancel one before creating another. Your existing invoices are still available.`
        : `Kamu punya ${error.limit} invoice aktif. Buka Pesanan saya untuk membayar atau membatalkan salah satunya sebelum membuat invoice baru. Invoice sebelumnya tetap bisa diakses.`,
      replyMarkup: { inline_keyboard: [
        [{ text: english ? "My orders" : "Pesanan saya", callback_data: "orders" }],
        [{ text: english ? "Back to catalog" : "Kembali ke katalog", callback_data: "catalog" }],
      ] },
    };
  }
  if (error instanceof ActiveInvoiceError) {
    return {
      text: english
        ? `⏳ You still have an active invoice: ${error.invoiceNumber}.\n\nOpen it to pay, cancel, or check verification. You can create a new invoice once this one is resolved or expires.`
        : `⏳ Masih ada invoice aktif: ${error.invoiceNumber}.\n\nBuka invoice untuk membayar, membatalkan, atau melihat status verifikasi. Invoice baru bisa dibuat setelah invoice ini selesai atau kedaluwarsa.`,
      replyMarkup: { inline_keyboard: [
        [{ text: english ? "🧾 Open active invoice" : "🧾 Buka invoice aktif", callback_data: `order:${error.orderId}` }],
        [{ text: english ? "🏠 Main menu" : "🏠 Menu utama", callback_data: "menu" }],
      ] },
    };
  }
  const message = error instanceof Error ? error.message : "";
  const lowerMessage = message.toLowerCase();
  const safePrefixes = ["Produk", "Stok", "Jumlah", "Saldo wallet", "Order", "Batch", "Redeem", "Akun", "File", "Upload", "Terlalu", "Pembayaran", "Top up"];
  let safeMessage = english
    ? "The request could not be processed. Please try again."
    : "Permintaan belum dapat diproses. Silakan coba lagi.";
  if (lowerMessage.includes("merchant qris shopee") || lowerMessage.includes("session shopee")) {
    safeMessage = english
      ? "Shopee QRIS is not ready yet. The admin must validate and bind the Shopee session first."
      : "QRIS Shopee belum siap. Admin perlu memvalidasi dan mengikat session Shopee terlebih dahulu.";
  } else if (lowerMessage.includes("invoice qris") || lowerMessage.includes("mode web-session")) {
    safeMessage = english
      ? "The QRIS invoice could not be created. Check the active QRIS merchant and try again."
      : "Invoice QRIS belum dapat dibuat. Periksa merchant QRIS aktif lalu coba lagi.";
  } else if (!english && (safePrefixes.some((prefix) => message.startsWith(prefix)) || lowerMessage.includes("maintenance"))) {
    safeMessage = message;
  } else if (english) {
    if (message.startsWith("Produk")) safeMessage = "This product is currently unavailable. Check the catalog for available products.";
    else if (message.startsWith("Stok")) safeMessage = "The requested stock is unavailable or has changed. Please check the product again.";
    else if (message.startsWith("Jumlah")) safeMessage = "The requested quantity is unavailable. Please select a valid quantity.";
    else if (message.startsWith("Saldo wallet")) safeMessage = "Your wallet balance is insufficient. Top up or choose another payment method.";
    else if (lowerMessage.includes("maintenance")) safeMessage = "Checkout is temporarily under maintenance. Please try again later.";
  }
  return {
    text: `⚠️ ${safeMessage}`,
    replyMarkup: { inline_keyboard: [
      [{ text: english ? "Back to catalog" : "Kembali ke katalog", callback_data: "catalog" }],
      [{ text: english ? "Main menu" : "Menu utama", callback_data: "menu" }],
    ] },
  };
}
