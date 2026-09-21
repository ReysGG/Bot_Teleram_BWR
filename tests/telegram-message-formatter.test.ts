import { describe, expect, it } from "vitest";
import { formatTelegramMessage } from "@/server/telegram/message-formatter";
import type { TelegramCustomEmojiSettings } from "@/server/telegram/custom-emoji";

const settings: TelegramCustomEmojiSettings = {
  chatgptCustomEmojiId: "111",
  claudeCustomEmojiId: null,
  emojiIds: {
    product: "222",
    catalog: "333",
  },
  updatedBy: null,
  updatedAt: null,
};

describe("Telegram message formatter", () => {
  it("combines custom emoji, bold, and code entities with UTF-16 offsets", () => {
    const result = formatTelegramMessage({
      text: "🧩 ChatGPT K12\nInvoice: TGS-123\nHarga: Rp10.000",
      customEmojiSettings: settings,
      emojiKeys: ["product"],
      bold: ["ChatGPT K12"],
      code: ["TGS-123", "Rp10.000"],
    });

    expect(result.text).toBe(
      "🧩 🤖 ChatGPT K12\nInvoice: TGS-123\nHarga: Rp10.000",
    );
    expect(result.entities).toEqual([
      { type: "custom_emoji", offset: 0, length: 2, custom_emoji_id: "222" },
      { type: "custom_emoji", offset: 3, length: 2, custom_emoji_id: "111" },
      { type: "bold", offset: 6, length: 11 },
      { type: "code", offset: 27, length: 7 },
      { type: "code", offset: 42, length: 8 },
    ]);
  });

  it("formats every regex capture while deduplicating repeated matchers", () => {
    const result = formatTelegramMessage({
      text: "🧩 Harga: Rp1.000\n✅ Harga: Rp2.000",
      customEmojiSettings: settings,
      emojiKeys: ["product"],
      bold: [/(Harga):/g],
      code: [/(Rp[\d.]+)/g, "Rp1.000"],
    });

    expect(result.entities.filter((entity) => entity.type === "custom_emoji"))
      .toHaveLength(1);
    expect(result.entities.filter((entity) => entity.type === "bold")).toEqual([
      { type: "bold", offset: 3, length: 5 },
      { type: "bold", offset: 20, length: 5 },
    ]);
    expect(result.entities.filter((entity) => entity.type === "code")).toEqual([
      { type: "code", offset: 10, length: 7 },
      { type: "code", offset: 27, length: 7 },
    ]);
  });

  it("gives code precedence when a bold matcher overlaps the same value", () => {
    const result = formatTelegramMessage({
      text: "Harga: Rp10.000",
      customEmojiSettings: settings,
      bold: [/(Rp[\d.]+)/g],
      code: [/(Rp[\d.]+)/g],
    });

    expect(result.entities).toEqual([
      { type: "code", offset: 7, length: 8 },
    ]);
  });

  it("preserves full product-name formatting across inserted brand emoji", () => {
    const productName = "ChatGPT Codex JSON";
    const result = formatTelegramMessage({
      text: `🧩 ${productName}\nHarga: Rp10.000`,
      customEmojiSettings: {
        ...settings,
        emojiIds: {
          codex: "444",
          json: "555",
        },
      },
      bold: [productName],
      code: ["Rp10.000"],
    });
    const boldEntities = result.entities.filter((entity) => entity.type === "bold");

    for (const word of ["ChatGPT", "Codex", "JSON"]) {
      const offset = result.text.indexOf(word);
      expect(boldEntities.some((entity) =>
        entity.offset <= offset &&
        entity.offset + entity.length >= offset + word.length,
      )).toBe(true);
    }
    expect(result.entities.filter((entity) => entity.type === "custom_emoji"))
      .toHaveLength(3);
    const amountOffset = result.text.indexOf("Rp10.000");
    expect(result.entities).toContainEqual({
      type: "code",
      offset: amountOffset,
      length: "Rp10.000".length,
    });
  });
});
