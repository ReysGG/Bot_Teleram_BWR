import { describe, expect, it } from "vitest";
import {
  parseAdminProductInput,
  parseProductStatus,
} from "@/server/products/admin";
import {
  productButtonTextWithCustomEmoji,
  productCreatedMessage,
  productCustomEmojiPresentation,
  productRestockMessage,
  productSoldOutMessage,
} from "@/server/telegram/product-broadcast";
import {
  productRestockDedupeKey,
  productSoldOutDedupeKey,
} from "@/server/telegram/delivery-key";
import { productRemovalMode } from "@/server/products/removal";
import {
  parseAdminProductGroupInput,
  productGroupRemovalMode,
} from "@/server/products/group-admin";

describe("admin product CRUD", () => {
  it("deletes unused products but preserves products with order history", () => {
    expect(productRemovalMode({ hasOrderHistory: false, status: "ACTIVE" })).toBe("DELETE");
    expect(productRemovalMode({ hasOrderHistory: true, status: "ACTIVE" })).toBe("DEACTIVATE");
    expect(productRemovalMode({ hasOrderHistory: true, status: "INACTIVE" })).toBe("PROTECTED");
  });

  it("parses editable price and preorder fields", () => {
    expect(
      parseAdminProductInput({
        name: "ChatGPT K12",
        description: "Produk akun K12",
        price: "12000",
        imageUrl: "",
        preorderEnabled: "on",
        preorderEtaText: "1 hari",
        preorderLimit: "10",
      }),
    ).toEqual({
      name: "ChatGPT K12",
      groupId: null,
      variantLabel: null,
      groupSortOrder: 0,
      description: "Produk akun K12",
      descriptionEntities: [],
      descriptionEn: null,
      descriptionEntitiesEn: [],
      price: 12_000,
      imageUrl: null,
      postDeliveryInstructions: null,
      postDeliveryEntities: [],
      redeemUrl: null,
      preorderEnabled: true,
      preorderEtaText: "1 hari",
      preorderLimit: 10,
    });
    expect(parseProductStatus("INACTIVE")).toBe("INACTIVE");
  });

  it("parses an optional product group assignment and variant label", () => {
    expect(
      parseAdminProductInput({
        name: "ChatGPT K12",
        groupId: "chatgpt-group",
        variantLabel: "K12 JSON",
        groupSortOrder: "20",
        description: "Produk akun K12",
        price: "12000",
        imageUrl: "",
      }),
    ).toMatchObject({
      groupId: "chatgpt-group",
      variantLabel: "K12 JSON",
      groupSortOrder: 20,
    });

    expect(() =>
      parseAdminProductInput({
        name: "ChatGPT K12",
        groupId: "chatgpt-group",
        variantLabel: "",
        description: "Produk akun K12",
        price: "12000",
      }),
    ).toThrow();
  });

  it("rejects zero or fractional prices", () => {
    const base = {
      name: "ChatGPT K12",
      description: "Produk akun K12",
      imageUrl: "",
      preorderEnabled: "false",
    };
    expect(() => parseAdminProductInput({ ...base, price: "0" })).toThrow();
    expect(() => parseAdminProductInput({ ...base, price: "10.5" })).toThrow();
  });

  it("normalizes optional post-delivery instructions and an HTTPS redeem URL", () => {
    expect(
      parseAdminProductInput({
        name: "CDK Product",
        description: "Produk dengan redeem",
        price: "15000",
        postDeliveryInstructions: "  Masukkan kode dari file.  ",
        postDeliveryEntities: JSON.stringify([
          { type: "bold", offset: 2, length: 8 },
        ]),
        redeemUrl: "https://redeem.example.com/path",
      }),
    ).toMatchObject({
      postDeliveryInstructions: "Masukkan kode dari file.",
      postDeliveryEntities: [{ type: "bold", offset: 0, length: 8 }],
      redeemUrl: "https://redeem.example.com/path",
    });
    expect(() =>
      parseAdminProductInput({
        name: "CDK Product",
        description: "Produk dengan redeem",
        price: "15000",
        redeemUrl: "http://redeem.example.com",
      }),
    ).toThrow();
    expect(() =>
      parseAdminProductInput({
        name: "CDK Product",
        description: "Produk dengan redeem",
        price: "15000",
        redeemUrl: "https://user:secret@redeem.example.com",
      }),
    ).toThrow();
  });

  it("keeps catalog formatter offsets aligned while trimming the description", () => {
    expect(
      parseAdminProductInput({
        name: "Formatted Product",
        description: "  Buka katalog  ",
        descriptionEntities: JSON.stringify([
          { type: "bold", offset: 2, length: 4 },
          {
            type: "text_link",
            offset: 7,
            length: 7,
            url: "https://catalog.example.test/product",
          },
        ]),
        price: "15000",
      }),
    ).toMatchObject({
      description: "Buka katalog",
      descriptionEntities: [
        { type: "bold", offset: 0, length: 4 },
        {
          type: "text_link",
          offset: 5,
          length: 7,
          url: "https://catalog.example.test/product",
        },
      ],
    });
  });

});

describe("admin product group CRUD", () => {
  it("parses editable group fields", () => {
    expect(parseAdminProductGroupInput({
      name: "ChatGPT",
      description: "Semua varian ChatGPT",
      imageUrl: "",
      status: "ACTIVE",
      sortOrder: "10",
    })).toEqual({
      name: "ChatGPT",
      description: "Semua varian ChatGPT",
      descriptionEntities: [],
      descriptionEn: null,
      descriptionEntitiesEn: [],
      imageUrl: null,
      status: "ACTIVE",
      sortOrder: 10,
    });
  });

  it("parses formatted group descriptions with the same reusable policy", () => {
    expect(parseAdminProductGroupInput({
      name: "Claude",
      description: "  Semua varian Claude  ",
      descriptionEntities: JSON.stringify([
        { type: "bold", offset: 2, length: 18 },
      ]),
      status: "ACTIVE",
    })).toMatchObject({
      description: "Semua varian Claude",
      descriptionEntities: [{ type: "bold", offset: 0, length: 18 }],
    });
  });

  it("protects groups that still have variants", () => {
    expect(productGroupRemovalMode(0)).toBe("DELETE");
    expect(productGroupRemovalMode(1)).toBe("PROTECTED");
  });
});

describe("Telegram product broadcasts", () => {
  it("does not render a second visual emoji when a custom button icon is present", () => {
    expect(productButtonTextWithCustomEmoji("🧩 Lihat produk", "custom-id"))
      .toBe("Lihat produk");
    expect(productButtonTextWithCustomEmoji("Lihat katalog", "custom-id"))
      .toBe("Lihat katalog");
    expect(productButtonTextWithCustomEmoji("🧩 Lihat produk"))
      .toBe("🧩 Lihat produk");
  });

  it("formats product-created and restock messages with purchasing context", () => {
    const created = productCreatedMessage({
      name: "ChatGPT K12",
      price: 8_000,
      description: "Akun siap pakai",
      availableNow: 3,
    });
    const restocked = productRestockMessage({
      name: "ChatGPT K12",
      price: 8_000,
      addedCount: 5,
      availableNow: 7,
    });

    expect(created).toContain("🔥 PRODUK BARU");
    expect(created).toContain("Harga:");
    expect(created).toContain("8.000");
    expect(restocked).toContain("🔥 STOK BARU MASUK");
    expect(restocked).toContain("Baru ditambahkan: 5 stok");
    expect(restocked).toContain("Tersedia sekarang: 7 stok");
    expect(restocked).not.toContain("5 file");
  });

  it("includes the parent group and short variant label in broadcasts", () => {
    const created = productCreatedMessage({
      name: "ChatGPT K12 JSON Full Name",
      groupName: "ChatGPT",
      variantLabel: "K12 JSON",
      price: 8_000,
      description: "Akun siap pakai",
      availableNow: 3,
    });

    expect(created).toContain("ChatGPT > K12 JSON");
    expect(created).not.toContain("ChatGPT K12 JSON Full Name");
  });

  it("decorates both brands without changing the broadcast line layout", () => {
    const message = productCreatedMessage({
      name: "Multi AI Combo",
      groupName: "Claude + ChatGPT",
      variantLabel: "Combo",
      price: 8_000,
      description: "Akun siap pakai",
      availableNow: 3,
    });
    const presentation = productCustomEmojiPresentation({
      text: message,
      name: "Multi AI Combo",
      groupName: "Claude + ChatGPT",
      variantLabel: "Combo",
      settings: {
        chatgptCustomEmojiId: "111",
        claudeCustomEmojiId: "222",
        updatedBy: null,
        updatedAt: null,
      },
    });

    expect(presentation.text.split("\n")).toHaveLength(message.split("\n").length);
    expect(presentation.text).toContain(
      "\u{1F9E0} Claude + \u{1F916} ChatGPT > Combo",
    );
    expect(
      presentation.entities
        .filter((entity) => entity.type === "custom_emoji")
        .map((entity) => entity.custom_emoji_id),
    ).toEqual(["222", "111"]);
    expect(presentation.iconCustomEmojiId).toBe("222");
  });

  it("deduplicates one restock batch per subscriber", () => {
    expect(productRestockDedupeKey("batch-1", "chat-1")).toBe(
      "product-restock:batch-1:chat-1",
    );
  });

  it("formats and deduplicates a global sold-out broadcast", () => {
    expect(
      productSoldOutMessage({
        name: "ChatGPT K12",
        price: 8_000,
        reservedNow: 2,
        preorderEtaText: "10 menit",
      }),
    ).toContain("STOK SIAP HABIS");
    expect(productSoldOutDedupeKey("order-1", "chat-1")).toBe(
      "product-sold-out:order-1:chat-1",
    );
  });
});
