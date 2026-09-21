import type { InlineKeyboard } from "@/server/telegram/api";
import type { TelegramLocale } from "@/server/telegram/i18n";
import { telegramCommunityChannels } from "@/server/telegram/membership";
import type { TelegramAccountSummary } from "@/server/telegram/account-summary";
import { formatRupiah } from "@/server/utils/format";

const TELEGRAM_ADMIN_ID = "7398144015";

export function mainMenuContent(
  notice?: string,
  locale: TelegramLocale = "id",
  account?: TelegramAccountSummary,
): {
  text: string;
  replyMarkup: InlineKeyboard;
} {
  const english = locale === "en";
  const displayName = account
    ? (account.displayName || account.username || (english ? "there" : "Kak"))
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48)
    : null;
  const username = account?.username
    ? `@${account.username}`
    : english
      ? "Not set"
      : "Belum diatur";
  return {
    text: [
      displayName
        ? english
          ? `Hi, ${displayName}.`
          : `Halo, ${displayName}.`
        : "BWR TELE",
      english
        ? "Welcome to BWR Tele."
        : "Selamat datang di BWR Tele.",
      ...(notice ? ["", notice] : []),
      ...(account
        ? [
            "",
            english ? "YOUR ACCOUNT" : "AKUN KAMU",
            `├ ${english ? "Telegram ID" : "ID Telegram"}: ${account.chatId}`,
            `├ Username: ${username}`,
            `├ ${english ? "Completed orders" : "Pesanan selesai"}: ${account.completedOrders}`,
            `├ ${english ? "Total spent" : "Total belanja"}: ${formatRupiah(account.totalSpent)}`,
            `├ ${english ? "Wallet balance" : "Saldo wallet"}: ${formatRupiah(account.walletBalance)}`,
            `└ ${english ? "Stock alerts" : "Notifikasi stok"}: ${
              account.notificationsEnabled
                ? english ? "On" : "Aktif"
                : english ? "Off" : "Nonaktif"
            }`,
          ]
        : [
            "",
            english
              ? "Buy digital products, manage your wallet, and order SMS OTP in this chat."
              : "Belanja produk digital, atur saldo, dan pesan SMS OTP langsung di chat ini.",
          ]),
      "",
      "━━━━━━━━━━━━",
      english ? "Choose a service:" : "Pilih layanan:",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: english ? "Products" : "Produk digital", callback_data: "catalog" },
          { text: "SMS & OTP", callback_data: "sms_services:1" },
        ],
        [
          { text: english ? "Wallet & top up" : "Wallet & top up", callback_data: "wallet" },
          { text: english ? "My orders" : "Order saya", callback_data: "orders" },
        ],
        [
          { text: english ? "Get Codex Free login" : "Ambil login Codex Free", callback_data: "k12_redeem" },
        ],
        [
          { text: english ? "Referral" : "Referral", callback_data: "referral" },
          { text: english ? "More" : "Lainnya", callback_data: "more" },
        ],
      ],
    },
  };
}

export function moreMenuContent(locale: TelegramLocale): {
  text: string;
  replyMarkup: InlineKeyboard;
} {
  const english = locale === "en";
  return {
    text: [
      english ? "Settings & help" : "Pengaturan & bantuan",
      "━━━━━━━━━━━━",
      english
        ? "Manage notifications and language, view community updates, or contact support."
        : "Atur notifikasi dan bahasa, lihat update komunitas, atau hubungi bantuan.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: english ? "Notifications" : "Notifikasi", callback_data: "notifications" },
          { text: english ? "Language" : "Bahasa", callback_data: "language" },
        ],
        [{ text: english ? "Community & updates" : "Komunitas & update", callback_data: "community" }],
        [{ text: english ? "Help" : "Bantuan", callback_data: "help" }],
        [{ text: english ? "Back to menu" : "Kembali ke menu", callback_data: "menu" }],
      ],
    },
  };
}

export function communityMenuContent(locale: TelegramLocale): {
  text: string;
  replyMarkup: InlineKeyboard;
} {
  const english = locale === "en";
  const channels = telegramCommunityChannels(locale);
  return {
    text: [
      english ? "Community & updates" : "Komunitas & update",
      "",
      english
        ? "These channels share stock updates, promos, and service news. Joining is optional; shopping, payment, and delivery stay in this private chat."
        : "Channel ini berisi info stok, promo, dan kabar layanan. Ikut boleh, tidak ikut juga tidak masalah; belanja, pembayaran, dan pengiriman tetap berjalan di chat pribadi ini.",
      "",
      english ? "Choose a channel if you want updates:" : "Pilih channel jika ingin mendapat update:",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...channels.map((channel) => [{ text: channel.label, url: channel.url }]),
        [{ text: english ? "Back to menu" : "Kembali ke menu", callback_data: "menu" }],
      ],
    },
  };
}

export function helpMenuContent(locale: TelegramLocale): {
  text: string;
  replyMarkup: InlineKeyboard;
} {
  const english = locale === "en";
  return {
    text: [
      english ? "BWR Tele help" : "Bantuan BWR Tele",
      "",
      english
        ? "1. Open Products and choose an item.\n2. Choose quantity and payment method.\n3. Pay the exact invoice amount.\n4. The product is delivered automatically in this private chat."
        : "1. Buka Produk digital dan pilih item.\n2. Pilih jumlah dan metode pembayaran.\n3. Bayar sesuai nominal invoice.\n4. Produk dikirim otomatis di chat pribadi ini.",
      "",
      english
        ? "You do not need a channel membership to shop or receive a product. For payment or delivery problems, open My orders or contact admin."
        : "Kamu tidak perlu masuk channel untuk belanja atau menerima produk. Jika ada masalah pembayaran atau delivery, buka Order saya atau hubungi admin.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [
          { text: english ? "Products" : "Produk digital", callback_data: "catalog" },
          { text: english ? "My orders" : "Order saya", callback_data: "orders" },
        ],
        [{ text: english ? "Contact admin" : "Bantuan admin", url: `tg://user?id=${TELEGRAM_ADMIN_ID}` }],
        [{ text: english ? "Back to menu" : "Kembali ke menu", callback_data: "menu" }],
      ],
    },
  };
}
