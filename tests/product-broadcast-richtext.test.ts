import { describe, expect, it } from "vitest";
import { productCreatedTelegramDocument } from "@/server/telegram/product-broadcast";

const settings = {
  chatgptCustomEmojiId: "111",
  claudeCustomEmojiId: null,
  emojiIds: { product: "999" },
  updatedBy: null,
  updatedAt: null,
};

describe("Telegram product-created rich document", () => {
  it("preserves public rich text after a custom-emoji header", () => {
    const description = "🔥 Akun aman\nBaca panduan";
    const document = productCreatedTelegramDocument({
      name: "ChatGPT K12",
      price: 8_000,
      description,
      descriptionEntities: [
        { type: "bold", offset: 3, length: 4 },
        {
          type: "text_link",
          offset: description.indexOf("panduan"),
          length: "panduan".length,
          url: "https://example.com/panduan",
        },
      ],
      availableNow: 3,
      settings,
    });

    expect(document.text).toContain(description);
    expect(document.iconCustomEmojiId).toBe("111");
    expect(
      document.entities.some(
        (entity) =>
          entity.type === "custom_emoji" && entity.custom_emoji_id === "111",
      ),
    ).toBe(true);
    expect(
      document.entities.find(
        (entity) =>
          entity.type === "bold" &&
          document.text.slice(entity.offset, entity.offset + entity.length) === "Akun",
      ),
    ).toMatchObject({ length: 4 });
    expect(
      document.entities.find(
        (entity) =>
          entity.type === "text_link" &&
          document.text.slice(entity.offset, entity.offset + entity.length) === "panduan",
      ),
    ).toMatchObject({ url: "https://example.com/panduan" });
  });

  it("truncates the public description without splitting an emoji surrogate pair", () => {
    const document = productCreatedTelegramDocument({
      name: "ChatGPT K12",
      price: 8_000,
      description: `${"x".repeat(699)}🔥rahasia`,
      descriptionEntities: [
        { type: "bold", offset: 699, length: 2 },
      ],
      availableNow: 1,
      settings,
    });

    const descriptionStart = document.text.indexOf("x".repeat(50));
    const footerStart = document.text.lastIndexOf("\n\nGunakan tombol");
    const renderedDescription = document.text.slice(descriptionStart, footerStart);
    expect(renderedDescription).toBe("x".repeat(699));
    expect(renderedDescription).not.toContain("\uFFFD");
    expect(
      document.entities.some(
        (entity) =>
          entity.type === "bold" && entity.offset >= descriptionStart + 699,
      ),
    ).toBe(false);
  });

  it("localizes product announcements for English recipients", () => {
    const document = productCreatedTelegramDocument({
      name: "ChatGPT K12",
      price: 8_000,
      description: "Ready to use account",
      descriptionEntities: [],
      availableNow: 3,
      locale: "en",
      settings,
    });

    expect(document.text).toContain("NEW PRODUCT");
    expect(document.text).toContain("Ready stock: 3 units");
    expect(document.text).toMatch(/Price: Rp\s8\.000/);
    expect(document.text).toContain("Use the button below to purchase.");
  });
});
