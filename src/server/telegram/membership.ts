import { optionalEnv } from "@/server/env";
import type { TelegramLocale } from "@/server/telegram/i18n";

export type TelegramCommunityChannel = {
  label: string;
  url: string;
};
function channel(input: {
  urlEnv: string;
  fallbackUrl: string;
  label: string;
}): TelegramCommunityChannel {
  return {
    label: input.label,
    url: optionalEnv(input.urlEnv) ?? input.fallbackUrl,
  };
}

/** Community links are discoverable but never an access gate for commerce. */
export function telegramCommunityChannels(
  locale: TelegramLocale = "id",
): TelegramCommunityChannel[] {
  const english = locale === "en";
  return [
    channel({
      urlEnv: "TELEGRAM_SHARING_CHANNEL_URL",
      fallbackUrl: "https://t.me/+apR5dsE0r4M4OGJl",
      label: "Sharing Session",
    }),
    channel({
      urlEnv: "TELEGRAM_MAIN_CHANNEL_URL",
      fallbackUrl: "https://t.me/buildwithreys",
      label: "Channel BuildWithReys",
    }),
    channel({
      urlEnv: "TELEGRAM_SUCCESS_CHANNEL_URL",
      fallbackUrl: "https://t.me/bwrtele_success",
      label: english ? "Successful transactions" : "Transaksi sukses",
    }),
  ];
}
