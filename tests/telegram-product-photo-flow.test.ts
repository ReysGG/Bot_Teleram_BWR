import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findSession: vi.fn(),
  upsertSession: vi.fn(),
  render: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    product: { findFirst: mocks.findProduct },
    botSession: {
      findUnique: mocks.findSession,
      upsert: mocks.upsertSession,
    },
  },
}));
vi.mock("@/server/store/maintenance", () => ({
  getMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, message: "" }),
}));
vi.mock("@/server/telegram/custom-emoji", () => ({
  buildTelegramCustomEmojiPresentation: vi.fn((text: string) => ({
    text,
    entities: [],
  })),
  buildTelegramCustomEmojiPresentationTransform: vi.fn((text: string) => ({
    text,
    entities: [],
    insertions: [],
  })),
  customEmojiIdForKey: vi.fn(),
  firstBrandCustomEmojiId: vi.fn(),
  getTelegramCustomEmojiSettings: vi.fn().mockResolvedValue({
    chatgptCustomEmojiId: null,
    claudeCustomEmojiId: null,
    emojiIds: {},
    updatedBy: null,
    updatedAt: null,
  }),
}));

import { showProduct } from "@/server/telegram/flows/catalog/product";
import { showQuantityOptions } from "@/server/telegram/flows/catalog/quantity";
import { groupSelectionPayload } from "@/server/telegram/flows/catalog/selection";

const png = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);

describe("Telegram product photo detail", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("selects the uploaded image and renders it with the product keyboard", async () => {
    vi.stubEnv("APP_URL", "https://store.example");
    mocks.findProduct.mockResolvedValue({
      id: "product-1",
      name: "ChatGPT Business",
      variantLabel: null,
      groupId: null,
      group: null,
      description: "Akun siap dipakai",
      descriptionEntities: [],
      imageUrl: `data:image/png;base64,${png.toString("base64")}`,
      price: 10_000,
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
      stockItems: [{ status: "AVAILABLE" }],
      _count: { orderItems: 0 },
    });
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 71 });

    await showProduct(mocks.render, "123", "product-1", 70);

    expect(mocks.findProduct).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ imageUrl: true }),
    }));
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      chatId: "123",
      messageId: 70,
      photoUrl: expect.stringMatching(
        /^https:\/\/store\.example\/api\/catalog\/products\/product-1\/image\?v=/,
      ),
      replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
    }));
    expect(mocks.render.mock.calls[0][0].text.length).toBeLessThanOrEqual(1_024);
  });

  it("keeps the existing text-only detail when no image exists", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "product-1",
      name: "Produk biasa",
      variantLabel: null,
      groupId: null,
      group: null,
      description: "Tanpa foto",
      descriptionEntities: [],
      imageUrl: null,
      price: 10_000,
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
      stockItems: [{ status: "AVAILABLE" }],
      _count: { orderItems: 0 },
    });
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 71 });

    await showProduct(mocks.render, "123", "product-1");

    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      photoUrl: null,
    }));
  });

  it("uses the reviewed English description for an English catalog session", async () => {
    mocks.findProduct.mockResolvedValue({
      id: "product-1",
      name: "ChatGPT Team",
      variantLabel: null,
      groupId: null,
      group: null,
      description: "Deskripsi Indonesia",
      descriptionEntities: [{ type: "bold", offset: 0, length: 9 }],
      descriptionEn: "English account description",
      descriptionEntitiesEn: [{ type: "italic", offset: 0, length: 7 }],
      imageUrl: null,
      price: 10_000,
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
      stockItems: [{ status: "AVAILABLE" }],
      _count: { orderItems: 0 },
    });
    mocks.findSession.mockResolvedValue({
      locale: "en",
      cart: null,
      catalogSearchQuery: null,
    });
    mocks.render.mockResolvedValue({ message_id: 71 });

    await showProduct(mocks.render, "123", "product-1");

    const presentation = mocks.render.mock.calls[0][0];
    expect(presentation.text).toContain("PRODUCT DETAILS");
    expect(presentation.text).toContain("English account description");
    expect(presentation.text).not.toContain("Deskripsi Indonesia");
    expect(presentation.text).toContain("Ready stock: 1");
  });

  it("keeps the uploaded product photo visible when stock is empty", async () => {
    vi.stubEnv("APP_URL", "https://store.example");
    mocks.findProduct.mockResolvedValue({
      id: "product-1",
      name: "ChatGPT Business",
      variantLabel: null,
      groupId: null,
      group: null,
      description: "Stok sedang habis",
      descriptionEntities: [],
      imageUrl: `data:image/png;base64,${png.toString("base64")}`,
      price: 10_000,
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
      stockItems: [],
      _count: { orderItems: 0 },
    });
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 71 });

    await showProduct(mocks.render, "123", "product-1", 70);

    const presentation = mocks.render.mock.calls[0][0];
    expect(presentation.photoUrl).toMatch(
      /^https:\/\/store\.example\/api\/catalog\/products\/product-1\/image\?v=/,
    );
    expect(presentation.text).toContain("stok habis");
    expect(presentation.replyMarkup.inline_keyboard.flat()).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: "buy:product-1" }),
      ]),
    );
  });

  it("inherits the parent group photo when a variant has no image", async () => {
    vi.stubEnv("APP_URL", "https://store.example");
    mocks.findProduct.mockResolvedValue({
      id: "product-1",
      name: "ChatGPT K12 JSON",
      variantLabel: "K12 JSON",
      groupId: "group-chatgpt",
      group: {
        id: "group-chatgpt",
        name: "ChatGPT",
        imageUrl: `data:image/png;base64,${png.toString("base64")}`,
      },
      description: "Varian tanpa gambar khusus",
      descriptionEntities: [],
      imageUrl: null,
      price: 10_000,
      preorderEnabled: false,
      preorderEtaText: null,
      preorderLimit: null,
      stockItems: [],
      _count: { orderItems: 0 },
    });
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 71 });

    await showProduct(mocks.render, "123", "product-1", 70);

    expect(mocks.render.mock.calls[0][0].photoUrl).toMatch(
      /^https:\/\/store\.example\/api\/catalog\/product-groups\/group-chatgpt\/image\?v=/,
    );
  });

  it("keeps the same product photo when moving to quantity selection", async () => {
    vi.stubEnv("APP_URL", "https://store.example");
    mocks.findProduct.mockResolvedValue({
      name: "ChatGPT Business",
      variantLabel: null,
      group: null,
      imageUrl: `data:image/png;base64,${png.toString("base64")}`,
      price: 10_000,
      preorderEnabled: false,
      preorderLimit: null,
      stockItems: [],
      _count: { stockItems: 20, orderItems: 0 },
    });
    mocks.render.mockResolvedValue({ message_id: 72 });
    mocks.findSession.mockResolvedValue(null);

    await showQuantityOptions(mocks.render, "123", "product-1", 70);

    expect(mocks.findProduct).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({ imageUrl: true }),
    }));
    expect(mocks.render).toHaveBeenCalledWith(expect.objectContaining({
      messageId: 70,
      photoUrl: expect.stringMatching(
        /^https:\/\/store\.example\/api\/catalog\/products\/product-1\/image\?v=/,
      ),
      replyMarkup: expect.objectContaining({ inline_keyboard: expect.any(Array) }),
    }));
    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        cart: expect.objectContaining({ messageId: 72 }),
      }),
    }));
  });

  it("keeps the originating variant page through quantity and product back navigation", async () => {
    vi.stubEnv("APP_URL", "https://store.example");
    const origin = groupSelectionPayload({
      messageId: 70,
      groupId: "group-chatgpt",
      page: 3,
      catalogPage: 2,
      searchQuery: "K12",
      items: [{ number: 11, productId: "product-1" }],
    });
    const quantityProduct = {
      id: "product-1",
      name: "ChatGPT K12 JSON",
      variantLabel: "K12 JSON",
      groupId: "group-chatgpt",
      group: { id: "group-chatgpt", name: "ChatGPT", imageUrl: null },
      imageUrl: null,
      price: 10_000,
      preorderEnabled: false,
      preorderLimit: null,
      stockItems: [],
      _count: { stockItems: 1, orderItems: 0 },
    };
    mocks.findProduct.mockResolvedValueOnce(quantityProduct);
    mocks.findSession.mockResolvedValue({
      cart: origin,
      catalogSearchQuery: "K12",
    });
    mocks.render.mockResolvedValue({ message_id: 70 });

    await showQuantityOptions(mocks.render, "123", "product-1", 70);

    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        cart: expect.objectContaining({
          returnCallback: "group_page:group-chatgpt:3",
        }),
      }),
    }));

    mocks.findSession.mockResolvedValue({
      cart: {
        productId: "product-1",
        messageId: 70,
        returnCallback: "group_page:group-chatgpt:3",
      },
      catalogSearchQuery: "K12",
    });
    mocks.findProduct.mockResolvedValueOnce({
      ...quantityProduct,
      description: "Akun siap dipakai",
      descriptionEntities: [],
      preorderEtaText: null,
      stockItems: [{ status: "AVAILABLE" }],
      _count: { orderItems: 0 },
    });
    await showProduct(mocks.render, "123", "product-1", 70);

    const productPresentation = mocks.render.mock.calls.at(-1)?.[0];
    expect(productPresentation.replyMarkup.inline_keyboard.flat()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ callback_data: "group_page:group-chatgpt:3" }),
      ]),
    );
  });
});
