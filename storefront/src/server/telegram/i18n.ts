export const TELEGRAM_LOCALES = ["id", "en"] as const;

export type TelegramLocale = (typeof TELEGRAM_LOCALES)[number];

export const DEFAULT_TELEGRAM_LOCALE: TelegramLocale = "id";

const TELEGRAM_COPY = {
  id: {
    languageTitle: "🌐 Pilih bahasa",
    languageDescription: "Bahasa ini akan digunakan untuk menu dan notifikasi bot.",
    languageIndonesian: "🇮🇩 Bahasa Indonesia",
    languageEnglish: "🇬🇧 English",
    languageSaved: "✅ Bahasa berhasil diubah ke Bahasa Indonesia.",
    backToMenu: "⬅️ Kembali ke menu",
    mainMenu: "🏠 Menu utama",
    helpAdmin: "☎️ Bantuan admin",
  },
  en: {
    languageTitle: "🌐 Choose language",
    languageDescription: "This language will be used for bot menus and notifications.",
    languageIndonesian: "🇮🇩 Bahasa Indonesia",
    languageEnglish: "🇬🇧 English",
    languageSaved: "✅ Language changed to English.",
    backToMenu: "⬅️ Back to menu",
    mainMenu: "🏠 Main menu",
    helpAdmin: "☎️ Contact admin",
  },
} as const;

export type TelegramCopyKey = keyof (typeof TELEGRAM_COPY)["id"];

export function isTelegramLocale(value: string): value is TelegramLocale {
  return TELEGRAM_LOCALES.includes(value as TelegramLocale);
}

export function parseTelegramLocale(
  value: string | null | undefined,
): TelegramLocale | null {
  const normalized = value?.trim().toLowerCase().replaceAll("_", "-") ?? "";
  if (normalized === "in" || normalized.startsWith("in-")) return "id";
  const primaryLanguage = normalized.split("-")[0];
  return isTelegramLocale(primaryLanguage) ? primaryLanguage : null;
}

export function normalizeTelegramLocale(
  value: string | null | undefined,
): TelegramLocale {
  return parseTelegramLocale(value) ?? DEFAULT_TELEGRAM_LOCALE;
}

export function resolveTelegramLocale(input: {
  preferredLocale?: string | null;
  telegramLanguageCode?: string | null;
}): TelegramLocale {
  const preferredLocale = parseTelegramLocale(input.preferredLocale);
  if (preferredLocale) return preferredLocale;
  return normalizeTelegramLocale(input.telegramLanguageCode);
}

export function telegramText(locale: TelegramLocale, key: TelegramCopyKey): string {
  return TELEGRAM_COPY[locale][key];
}

export function telegramLanguageCallback(locale: TelegramLocale): string {
  return `language:${locale}`;
}

export function parseTelegramLanguageCallback(
  callbackData: string,
): TelegramLocale | null {
  if (!callbackData.startsWith("language:")) return null;
  const rawLocale = callbackData.slice("language:".length);
  return isTelegramLocale(rawLocale) ? rawLocale : null;
}
