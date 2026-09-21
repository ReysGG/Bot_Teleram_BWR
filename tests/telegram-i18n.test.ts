import { describe, expect, it } from "vitest";
import {
  DEFAULT_TELEGRAM_LOCALE,
  normalizeTelegramLocale,
  parseTelegramLanguageCallback,
  resolveTelegramLocale,
  telegramLanguageCallback,
  telegramText,
} from "@/server/telegram/i18n";
import {
  communityMenuContent,
  helpMenuContent,
  mainMenuContent,
  moreMenuContent,
} from "@/server/telegram/menu";

describe("Telegram i18n", () => {
  it("normalizes Telegram regional language codes", () => {
    expect(normalizeTelegramLocale("id-ID")).toBe("id");
    expect(normalizeTelegramLocale("en_US")).toBe("en");
    expect(normalizeTelegramLocale("in-ID")).toBe("id");
  });

  it("falls back to Indonesian for unsupported or missing languages", () => {
    expect(normalizeTelegramLocale("de-DE")).toBe(DEFAULT_TELEGRAM_LOCALE);
    expect(normalizeTelegramLocale(undefined)).toBe(DEFAULT_TELEGRAM_LOCALE);
  });

  it("prefers an explicitly saved locale over the Telegram client language", () => {
    expect(
      resolveTelegramLocale({
        preferredLocale: "en",
        telegramLanguageCode: "id-ID",
      }),
    ).toBe("en");
    expect(
      resolveTelegramLocale({ telegramLanguageCode: "en-GB" }),
    ).toBe("en");
    expect(
      resolveTelegramLocale({
        preferredLocale: "unsupported",
        telegramLanguageCode: "en-GB",
      }),
    ).toBe("en");
  });

  it("provides typed copy for both supported languages", () => {
    expect(telegramText("id", "mainMenu")).toBe("🏠 Menu utama");
    expect(telegramText("en", "mainMenu")).toBe("🏠 Main menu");
  });

  it("round-trips only supported language callbacks", () => {
    expect(parseTelegramLanguageCallback(telegramLanguageCallback("id"))).toBe("id");
    expect(parseTelegramLanguageCallback(telegramLanguageCallback("en"))).toBe("en");
    expect(parseTelegramLanguageCallback("language:fr")).toBeNull();
    expect(parseTelegramLanguageCallback("catalog")).toBeNull();
  });

  it("renders the main menu and language entry in the selected locale", () => {
    const english = mainMenuContent(undefined, "en");
    const indonesian = mainMenuContent(undefined, "id");

    expect(english.text).toContain("Choose a service");
    expect(indonesian.text).toContain("Pilih layanan");
    expect(indonesian.text).not.toContain("Cara belanja cepat");
    expect(english.replyMarkup.inline_keyboard.flat()).toContainEqual(
      expect.objectContaining({ text: "More", callback_data: "more" }),
    );
    expect(indonesian.replyMarkup.inline_keyboard).toHaveLength(4);
    expect(indonesian.replyMarkup.inline_keyboard[2]).toEqual([
      expect.objectContaining({ text: "Ambil login Codex Free" }),
    ]);
  });

  it("renders a concise private account summary when account data is available", () => {
    const menu = mainMenuContent(undefined, "id", {
      chatId: "123456789",
      username: "buyer_test",
      displayName: "Daps",
      walletBalance: 25_000,
      completedOrders: 3,
      totalSpent: 125_000,
      notificationsEnabled: true,
    });

    expect(menu.text).toContain("Halo, Daps.");
    expect(menu.text).toContain("AKUN KAMU");
    expect(menu.text).toContain("ID Telegram: 123456789");
    expect(menu.text).toContain("Username: @buyer_test");
    expect(menu.text).toContain("Pesanan selesai: 3");
    expect(menu.text).toContain("Total belanja");
    expect(menu.text).toContain("Saldo wallet");
    expect(menu.text).toContain("Notifikasi stok: Aktif");
    expect(menu.text).not.toContain("Total Pengguna");
  });

  it("explains optional community links and gives useful help", () => {
    const community = communityMenuContent("id");
    const help = helpMenuContent("id");
    const more = moreMenuContent("id");

    expect(community.text).toContain("info stok, promo, dan kabar layanan");
    expect(community.text).toContain("belanja, pembayaran, dan pengiriman tetap berjalan");
    expect(help.text).toContain("Bayar sesuai nominal invoice");
    expect(help.text).toContain("Order saya");
    expect(more.text).toContain("Pengaturan & bantuan");
    expect(more.replyMarkup.inline_keyboard.flat()).toContainEqual(
      expect.objectContaining({ text: "Komunitas & update", callback_data: "community" }),
    );
    expect(more.replyMarkup.inline_keyboard.flat()).toContainEqual(
      expect.objectContaining({ text: "Bahasa", callback_data: "language" }),
    );
  });
});
