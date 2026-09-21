import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  botSessionUpdateMany: vi.fn(),
  botSessionUpdate: vi.fn(),
  botSessionUpsert: vi.fn(),
  createOrder: vi.fn(),
  createQr: vi.fn(),
  getAttempt: vi.fn(),
  locale: vi.fn(),
  paymentUpdate: vi.fn(),
  refresh: vi.fn(),
  render: vi.fn(),
  submit: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    botSession: {
      update: mocks.botSessionUpdate,
      updateMany: mocks.botSessionUpdateMany,
      upsert: mocks.botSessionUpsert,
    },
    payment: { update: mocks.paymentUpdate },
  },
}));

vi.mock("@/server/payment/usdt-bep20", () => {
  class UsdtBep20Error extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  }
  return {
    createUsdtBep20Order: mocks.createOrder,
    getUsdtBep20AttemptForOrder: mocks.getAttempt,
    refreshUsdtBep20Verification: mocks.refresh,
    submitUsdtBep20Transaction: mocks.submit,
    UsdtBep20Error,
  };
});

vi.mock("@/server/payment/usdt-bep20-qr", () => ({
  createUsdtBep20AddressQr: mocks.createQr,
}));

vi.mock("@/server/telegram/locale-store", () => ({
  telegramLocaleForChat: mocks.locale,
}));

import { createUsdtBep20TelegramFlow } from "@/server/telegram/flows/payment/usdt-bep20";

const addressSnapshot = "0x1111111111111111111111111111111111111111";

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    orderId: "order-1",
    status: "AWAITING_TX_HASH",
    txHash: null,
    confirmations: null,
    requiredConfirmationsSnapshot: 12,
    recipientAddressSnapshot: addressSnapshot,
    expectedUsdtMicros: 1_234_500_001n,
    expiresAt: new Date("2026-09-02T16:00:00.000Z"),
    order: {
      invoiceNumber: "TGS-USDT-001",
      items: [{ productNameSnapshot: "ChatGPT Team", quantity: 2 }],
      payment: { telegramInvoiceMessageId: null },
    },
    ...overrides,
  };
}

describe("Telegram USDT BEP20 QR flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAttempt.mockResolvedValue(attempt());
    mocks.locale.mockResolvedValue("id");
    mocks.createQr.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    mocks.render.mockResolvedValue({ message_id: 88 });
    mocks.paymentUpdate.mockResolvedValue({});
    mocks.botSessionUpsert.mockResolvedValue({});
    mocks.botSessionUpdate.mockResolvedValue({});
  });

  it("sends one QR invoice from the immutable address snapshot with copy buttons", async () => {
    const flow = createUsdtBep20TelegramFlow({
      renderNavigationMessage: mocks.render,
    });

    await flow.showAttempt("123", "order-1", 77);

    expect(mocks.createQr).toHaveBeenCalledWith(addressSnapshot);
    expect(mocks.render).toHaveBeenCalledTimes(1);
    const presentation = mocks.render.mock.calls[0]?.[0];
    expect(presentation).toMatchObject({
      chatId: "123",
      messageId: 77,
      photoBuffer: {
        filename: "TGS-USDT-001-USDT-BEP20.png",
        png: expect.any(Buffer),
        reuseExistingPhoto: false,
      },
    });
    expect(presentation.text).toContain("BNB Smart Chain mainnet (BEP20)");
    expect(presentation.text).toContain("1,234.500001 USDT");
    expect(presentation.text).toContain(addressSnapshot);

    const buttons = presentation.replyMarkup.inline_keyboard.flat();
    expect(buttons).toContainEqual({
      text: "📋 Salin alamat",
      copy_text: { text: addressSnapshot },
    });
    expect(buttons).toContainEqual({
      text: "💵 Salin nominal",
      copy_text: { text: "1234.500001" },
    });
    expect(buttons).toContainEqual({
      text: "✅ Saya sudah transfer",
      callback_data: "usdt_transferred:order-1",
    });
    expect(mocks.paymentUpdate).toHaveBeenCalledWith({
      where: { orderId: "order-1" },
      data: { telegramInvoiceMessageId: 88 },
    });
  });

  it("keeps the complete text invoice available when local QR generation fails", async () => {
    mocks.createQr.mockRejectedValueOnce(new Error("QR unavailable"));
    const flow = createUsdtBep20TelegramFlow({
      renderNavigationMessage: mocks.render,
    });

    await flow.showAttempt("123", "order-1", 77);

    const presentation = mocks.render.mock.calls[0]?.[0];
    expect(presentation.photoBuffer).toBeUndefined();
    expect(presentation.text).toContain(addressSnapshot);
    expect(presentation.text).toContain("Nominal tepat");
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });

  it("fails closed before rendering when an invoice snapshot has an invalid address", async () => {
    mocks.getAttempt.mockResolvedValueOnce(attempt({
      recipientAddressSnapshot: "0x1234",
    }));
    const flow = createUsdtBep20TelegramFlow({
      renderNavigationMessage: mocks.render,
    });

    await expect(flow.showAttempt("123", "order-1", 77)).rejects.toThrow(
      "Alamat BEP20 tidak valid",
    );
    expect(mocks.createQr).not.toHaveBeenCalled();
    expect(mocks.render).not.toHaveBeenCalled();
  });

  it("stores the actual replacement message id while waiting for a transaction hash", async () => {
    mocks.render.mockResolvedValueOnce({ message_id: 92 });
    const flow = createUsdtBep20TelegramFlow({
      renderNavigationMessage: mocks.render,
    });

    await flow.promptForHash("123", "order-1", 88);

    expect(mocks.botSessionUpsert).toHaveBeenCalledWith({
      where: { chatId: "123" },
      create: {
        chatId: "123",
        state: "AWAITING_USDT_TX_HASH",
        cart: { orderId: "order-1", messageId: 88 },
      },
      update: {
        state: "AWAITING_USDT_TX_HASH",
        cart: { orderId: "order-1", messageId: 88 },
      },
    });
    expect(mocks.botSessionUpdate).toHaveBeenCalledWith({
      where: { chatId: "123" },
      data: { cart: { orderId: "order-1", messageId: 92 } },
    });
  });

  it("persists the hash-awaiting state before an ambiguous Telegram outcome", async () => {
    mocks.render.mockRejectedValueOnce(new Error("Telegram outcome unknown"));
    const flow = createUsdtBep20TelegramFlow({
      renderNavigationMessage: mocks.render,
    });

    await expect(flow.promptForHash("123", "order-1", 88)).rejects.toThrow(
      "Telegram outcome unknown",
    );

    expect(mocks.botSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: {
        state: "AWAITING_USDT_TX_HASH",
        cart: { orderId: "order-1", messageId: 88 },
      },
    }));
    expect(mocks.botSessionUpdate).not.toHaveBeenCalled();
  });
});
