import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findProduct: vi.fn(),
  findSession: vi.fn(),
  upsertSession: vi.fn(),
  updateSessions: vi.fn(),
  render: vi.fn(),
  sendMessage: vi.fn(),
  showMenu: vi.fn(),
  showPaymentOptions: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    product: { findFirst: mocks.findProduct },
    botSession: {
      findUnique: mocks.findSession,
      upsert: mocks.upsertSession,
      updateMany: mocks.updateSessions,
    },
  },
}));

vi.mock("@/server/store/maintenance", () => ({
  getMaintenanceState: vi.fn().mockResolvedValue({ enabled: false, message: "" }),
}));

vi.mock("@/server/telegram/api", () => ({
  sendMessage: mocks.sendMessage,
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
  customEmojiIdForKey: vi.fn((_settings, key: string) =>
    key === "cart" ? "222" : undefined,
  ),
  firstBrandCustomEmojiId: vi.fn(() => "111"),
  getTelegramCustomEmojiSettings: vi.fn().mockResolvedValue({
    chatgptCustomEmojiId: "111",
    claudeCustomEmojiId: null,
    emojiIds: { cart: "222" },
    updatedBy: null,
    updatedAt: null,
  }),
}));

import {
  handleQuantityInput,
  showCustomQuantityPrompt,
  showQuantityOptions,
} from "@/server/telegram/flows/catalog/quantity";
import { createCatalogProductFlow } from "@/server/telegram/flows/catalog";

function quantityProduct(input?: {
  readyStock?: number;
  reservedStock?: number;
  preorderEnabled?: boolean;
  preorderLimit?: number | null;
  activePreorders?: number;
  price?: number;
}) {
  return {
    name: "ChatGPT Codex JSON Free Plan",
    variantLabel: null,
    group: null,
    imageUrl: null,
    price: input?.price ?? 3_000,
    preorderEnabled: input?.preorderEnabled ?? false,
    preorderLimit: input?.preorderLimit ?? null,
    stockItems: Array.from(
      { length: input?.reservedStock ?? 0 },
      (_, index) => ({ id: `reserved-${index}` }),
    ),
    _count: {
      stockItems: input?.readyStock ?? 598,
      orderItems: input?.activePreorders ?? 0,
    },
  };
}

const telegramUser = {
  id: 123,
  first_name: "Buyer",
};

describe("Telegram product quantity flow", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("shows only stock-aware presets and remembers the actual rendered bubble", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 3 }));
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 91 });

    await showQuantityOptions(mocks.render, "123", "product-1", 70);

    const presentation = mocks.render.mock.calls[0][0];
    const buttons = presentation.replyMarkup.inline_keyboard.flat();
    expect(presentation.text).toContain("Maksimal pesanan saat ini: 3 akun");
    expect(buttons).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty:product-1:1" }),
      expect.objectContaining({ callback_data: "qty:product-1:2" }),
    ]));
    expect(buttons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty_custom:product-1" }),
    ]));
    expect(buttons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty:product-1:5" }),
      expect.objectContaining({ callback_data: "qty:product-1:10" }),
    ]));
    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        state: "AWAITING_QUANTITY",
        cart: expect.objectContaining({ messageId: 91 }),
      },
    }));
  });

  it("does not advertise quantity actions when stock and preorder are unavailable", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 0 }));
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 92 });

    await showQuantityOptions(mocks.render, "123", "product-1", 70);

    const buttons = mocks.render.mock.calls[0][0].replyMarkup.inline_keyboard.flat();
    expect(buttons.some((button: { callback_data: string }) =>
      button.callback_data.startsWith("qty:"),
    )).toBe(false);
    expect(buttons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty_custom:product-1" }),
    ]));
    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ state: "BROWSING" }),
    }));
  });

  it("caps displayed quantity when the unit price would overflow stored totals", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({
      readyStock: 598,
      price: 1_000_000_000,
    }));
    mocks.findSession.mockResolvedValue(null);
    mocks.render.mockResolvedValue({ message_id: 93 });

    await showQuantityOptions(mocks.render, "123", "product-1", 70);

    const presentation = mocks.render.mock.calls[0][0];
    const buttons = presentation.replyMarkup.inline_keyboard.flat();
    expect(presentation.text).toContain("Maksimal pesanan saat ini: 2 akun");
    expect(buttons).toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty:product-1:2" }),
    ]));
    expect(buttons).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ callback_data: "qty:product-1:5" }),
    ]));
  });

  it("stores the fallback bubble ID produced by the custom prompt renderer", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 20 }));
    mocks.findSession.mockResolvedValue({
      cart: { productId: "product-1", messageId: 70 },
      catalogSearchQuery: null,
    });
    mocks.render.mockResolvedValue({ message_id: 108 });

    await showCustomQuantityPrompt(mocks.render, "123", "product-1", 70);

    expect(mocks.upsertSession).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        state: "AWAITING_QUANTITY",
        cart: expect.objectContaining({ messageId: 108 }),
      },
    }));
    const backButton = mocks.render.mock.calls[0][0].replyMarkup.inline_keyboard[0][0];
    expect(backButton).not.toHaveProperty("icon_custom_emoji_id");
  });

  it("accepts 598, leaves quantity mode, and opens payment selection", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 598 }));

    await handleQuantityInput({
      showMenu: mocks.showMenu,
      showPaymentOptions: mocks.showPaymentOptions,
    }, {
      chatId: "123",
      text: "598",
      cart: { productId: "product-1", messageId: 108 },
      user: telegramUser,
    });

    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { chatId: "123", state: "AWAITING_QUANTITY" },
      data: { state: "BROWSING" },
    });
    expect(mocks.showPaymentOptions).toHaveBeenCalledWith(
      "123",
      "product-1",
      telegramUser,
      598,
      108,
    );
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });

  it("acknowledges every repeated excessive input with a targeted new message", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 750 }));
    mocks.sendMessage.mockResolvedValue({ message_id: 120 });
    const input = {
      chatId: "123",
      text: "751",
      cart: { productId: "product-1", messageId: 108 },
      user: telegramUser,
    };
    const dependencies = {
      showMenu: mocks.showMenu,
      showPaymentOptions: mocks.showPaymentOptions,
    };

    await handleQuantityInput(dependencies, input);
    await handleQuantityInput(dependencies, input);

    expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.sendMessage.mock.calls[0][1]).toContain("Maksimal 750 akun");
    const backButton = mocks.sendMessage.mock.calls[0][2].inline_keyboard[0][0];
    expect(backButton).not.toHaveProperty("icon_custom_emoji_id");
    expect(mocks.showPaymentOptions).not.toHaveBeenCalled();
  });

  it("explains the current stock limit instead of returning a generic error", async () => {
    mocks.findProduct.mockResolvedValue(quantityProduct({ readyStock: 3 }));
    mocks.sendMessage.mockResolvedValue({ message_id: 121 });

    await handleQuantityInput({
      showMenu: mocks.showMenu,
      showPaymentOptions: mocks.showPaymentOptions,
    }, {
      chatId: "123",
      text: "5",
      cart: { productId: "product-1", messageId: 108 },
      user: telegramUser,
    });

    expect(mocks.sendMessage.mock.calls[0][1]).toContain(
      "Stok siap saat ini 3 akun. Pilih maksimal 3 akun.",
    );
    expect(mocks.showPaymentOptions).not.toHaveBeenCalled();
  });

  it("leaves quantity mode before a preset quantity opens payment selection", async () => {
    const flow = createCatalogProductFlow({
      renderNavigationMessage: mocks.render,
      beginNewNavigationBubble: vi.fn(),
      showMenu: mocks.showMenu,
      showPaymentOptions: mocks.showPaymentOptions,
    });

    await flow.handleProductCallback({
      data: "qty:product-1:5",
      chatId: "123",
      messageId: 70,
      user: telegramUser,
    });

    expect(mocks.updateSessions).toHaveBeenCalledWith({
      where: { chatId: "123", state: "AWAITING_QUANTITY" },
      data: { state: "BROWSING" },
    });
    expect(mocks.showPaymentOptions).toHaveBeenCalledWith(
      "123",
      "product-1",
      telegramUser,
      5,
      70,
    );
  });
});
