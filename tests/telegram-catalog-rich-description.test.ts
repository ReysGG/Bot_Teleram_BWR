import { describe, expect, it } from "vitest";
import type { TelegramCustomEmojiSettings } from "@/server/telegram/custom-emoji";
import { productGroupTelegramDocument } from "@/server/telegram/flows/catalog/group";
import { productDetailTelegramDocument } from "@/server/telegram/flows/catalog/product";

const settings: TelegramCustomEmojiSettings = {
  chatgptCustomEmojiId: "111",
  claudeCustomEmojiId: null,
  emojiIds: { product: "222", payment: "333" },
  updatedBy: null,
  updatedAt: null,
};

describe("Telegram catalog rich descriptions", () => {
  it("keeps product and group screens available when persisted legacy entities are invalid", () => {
    const malformedEntities = [{ type: "bold", offset: 9_999, length: 4 }];
    const product = productDetailTelegramDocument({
      displayName: "ChatGPT K12",
      boldNames: ["ChatGPT K12"],
      description: "Deskripsi produk lama",
      descriptionEntities: malformedEntities,
      price: "Rp10.000",
      availabilityLines: ["Stok siap: 2"],
      customEmojiSettings: settings,
    });
    const group = productGroupTelegramDocument({
      displayName: "ChatGPT",
      groupName: "ChatGPT",
      description: "Deskripsi kategori lama",
      descriptionEntities: malformedEntities,
      variantCount: 2,
      currentPage: 1,
      totalPages: 1,
      customEmojiSettings: settings,
    });

    expect(product.text).toContain("Deskripsi produk lama");
    expect(group.text).toContain("Deskripsi kategori lama");
    expect(product.entities.some((entity) => entity.offset >= 9_999)).toBe(false);
    expect(group.entities.some((entity) => entity.offset >= 9_999)).toBe(false);
  });

  it("shifts product description entities after the formatted header", () => {
    const description = "🤖 Buka situs";
    const result = productDetailTelegramDocument({
      displayName: "ChatGPT K12",
      boldNames: ["ChatGPT K12"],
      description,
      descriptionEntities: [
        { type: "bold", offset: 3, length: 4 },
        {
          type: "text_link",
          offset: 8,
          length: 5,
          url: "https://example.test/redeem",
        },
      ],
      price: "Rp10.000",
      availabilityLines: ["✅ Stok siap: 2"],
      customEmojiSettings: settings,
    });

    const descriptionOffset = result.text.indexOf(description);
    expect(descriptionOffset).toBeGreaterThan(0);
    expect(result.entities).toEqual(expect.arrayContaining([
      { type: "bold", offset: descriptionOffset + 3, length: 4 },
      {
        type: "text_link",
        offset: descriptionOffset + 8,
        length: 5,
        url: "https://example.test/redeem",
      },
    ]));
    expect(result.text).not.toContain("Instruksi privat pembeli");
  });

  it("keeps group description formatting between its header and variant footer", () => {
    const description = "Promo minggu ini";
    const result = productGroupTelegramDocument({
      displayName: "ChatGPT",
      groupName: "ChatGPT",
      description,
      descriptionEntities: [
        { type: "bold", offset: 0, length: 5 },
        {
          type: "text_link",
          offset: 6,
          length: 6,
          url: "https://example.test/promo",
        },
      ],
      variantCount: 4,
      currentPage: 2,
      totalPages: 3,
      customEmojiSettings: settings,
    });

    const descriptionOffset = result.text.indexOf(description);
    expect(result.entities).toEqual(expect.arrayContaining([
      { type: "bold", offset: descriptionOffset, length: 5 },
      {
        type: "text_link",
        offset: descriptionOffset + 6,
        length: 6,
        url: "https://example.test/promo",
      },
    ]));
    expect(result.text.indexOf("4 varian")).toBeGreaterThan(descriptionOffset);
  });

  it("renders English catalog chrome around a localized group description", () => {
    const result = productGroupTelegramDocument({
      displayName: "ChatGPT",
      groupName: "ChatGPT",
      description: "Choose the account type you need.",
      descriptionEntities: [],
      variantCount: 4,
      currentPage: 2,
      totalPages: 3,
      customEmojiSettings: settings,
      locale: "en",
    });

    expect(result.text).toContain("CHOOSE A VARIANT");
    expect(result.text).toContain("4 variants - Page 2/3");
    expect(result.text).toContain("Press a variant to view details");
  });

  it("keeps product and group photo captions within Telegram's 1024 UTF-16 limit", () => {
    const product = productDetailTelegramDocument({
      displayName: "ChatGPT Business",
      boldNames: ["ChatGPT Business"],
      description: `ðŸ¤– ${"deskripsi panjang ".repeat(200)}`,
      descriptionEntities: [{ type: "bold", offset: 3, length: 9 }],
      price: "Rp10.000",
      availabilityLines: ["âœ… Stok siap: 2"],
      customEmojiSettings: settings,
      maxTextLength: 1_024,
    });
    const group = productGroupTelegramDocument({
      displayName: "ChatGPT",
      groupName: "ChatGPT",
      description: `ðŸ¤– ${"kategori panjang ".repeat(200)}`,
      descriptionEntities: [{ type: "italic", offset: 3, length: 8 }],
      variantCount: 4,
      currentPage: 1,
      totalPages: 2,
      customEmojiSettings: settings,
      maxTextLength: 1_024,
    });

    expect(product.text.length).toBeLessThanOrEqual(1_024);
    expect(group.text.length).toBeLessThanOrEqual(1_024);
    for (const document of [product, group]) {
      expect(document.entities.every(
        (entity) => entity.offset + entity.length <= document.text.length,
      )).toBe(true);
    }
  });
});
