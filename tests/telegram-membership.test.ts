import { afterEach, describe, expect, it } from "vitest";
import { telegramCommunityChannels } from "@/server/telegram/membership";

describe("optional Telegram community links", () => {
  afterEach(() => {
    delete process.env.TELEGRAM_SHARING_CHANNEL_URL;
    delete process.env.TELEGRAM_MAIN_CHANNEL_URL;
    delete process.env.TELEGRAM_SUCCESS_CHANNEL_URL;
  });

  it("uses configured links for stock, promo, and service updates", () => {
    process.env.TELEGRAM_SHARING_CHANNEL_URL = "https://t.me/sharing_example";
    process.env.TELEGRAM_MAIN_CHANNEL_URL = "https://t.me/main_example";
    process.env.TELEGRAM_SUCCESS_CHANNEL_URL = "https://t.me/success_example";

    expect(telegramCommunityChannels()).toEqual([
      { label: "Sharing Session", url: "https://t.me/sharing_example" },
      { label: "Channel BuildWithReys", url: "https://t.me/main_example" },
      { label: "Transaksi sukses", url: "https://t.me/success_example" },
    ]);
    expect(telegramCommunityChannels("en")[2].label).toBe("Successful transactions");
  });

  it("always provides safe defaults for optional links", () => {
    expect(telegramCommunityChannels().every((channel) => channel.url.startsWith("https://t.me/"))).toBe(true);
  });
});
