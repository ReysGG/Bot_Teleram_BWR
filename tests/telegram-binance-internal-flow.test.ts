import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAttempt: vi.fn(), locale: vi.fn(), render: vi.fn(), submit: vi.fn(),
  sessionUpsert: vi.fn(), sessionUpdate: vi.fn(), sessionReset: vi.fn(), paymentUpdate: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  botSession: { upsert: mocks.sessionUpsert, update: mocks.sessionUpdate, updateMany: mocks.sessionReset },
  payment: { update: mocks.paymentUpdate },
} }));
vi.mock("@/server/payment/binance-internal", () => ({
  BinanceInternalError: class extends Error {}, createBinanceInternalOrder: vi.fn(),
  getBinanceInternalAttemptForOrder: mocks.getAttempt,
  refreshBinanceInternalVerification: vi.fn(), submitBinanceInternalOrderId: mocks.submit,
}));
vi.mock("@/server/telegram/locale-store", () => ({ telegramLocaleForChat: mocks.locale }));
import { createBinanceInternalTelegramFlow } from "@/server/telegram/flows/payment/binance-internal";

const awaiting = {
  orderId: "order-1", status: "AWAITING_ORDER_ID", submittedOrderId: null,
  recipientBinanceIdSnapshot: "123456789", expectedUsdtMicros: 6_000_091n,
  expiresAt: new Date("2099-01-01"),
  order: { invoiceNumber: "TEST-001", items: [{ productNameSnapshot: "Test product", quantity: 1 }],
    payment: { telegramInvoiceMessageId: 88 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAttempt.mockResolvedValue(awaiting);
  mocks.locale.mockResolvedValue("en");
  mocks.render.mockResolvedValue({ message_id: 88 });
});

describe("Binance Pay buyer flow", () => {
  it("renders invoice snapshot copy buttons and requires the buyer's Order ID", async () => {
    await createBinanceInternalTelegramFlow({ renderNavigationMessage: mocks.render })
      .showAttempt("123", "order-1", 88);
    const screen = mocks.render.mock.calls[0][0];
    expect(screen.text).toContain("6.000091 USDT");
    expect(screen.text).toContain("Payment Details");
    expect(screen.replyMarkup.inline_keyboard.flat()).toEqual(expect.arrayContaining([
      { text: "📋 Copy Binance ID", copy_text: { text: "123456789" } },
      { text: "💵 Copy amount", copy_text: { text: "6.000091" } },
      { text: "✅ I have paid", callback_data: "binance_transferred:order-1" },
    ]));
    expect(mocks.submit).not.toHaveBeenCalled();
  });

  it("stores the replacement navigation bubble when prompting for the Order ID", async () => {
    mocks.render.mockResolvedValue({ message_id: 92 });
    await createBinanceInternalTelegramFlow({ renderNavigationMessage: mocks.render })
      .promptForOrderId("123", "order-1", 88);
    expect(mocks.sessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: { state: "AWAITING_BINANCE_ORDER_ID", cart: { orderId: "order-1", messageId: 88 } },
    }));
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { chatId: "123" }, data: { cart: { orderId: "order-1", messageId: 92 } },
    });
  });

  it("submits the exact receipt as text for verification before showing success", async () => {
    mocks.getAttempt.mockResolvedValueOnce(awaiting).mockResolvedValueOnce({
      ...awaiting, status: "CONFIRMED", submittedOrderId: "4524974695110983001",
    });
    await createBinanceInternalTelegramFlow({ renderNavigationMessage: mocks.render }).submitOrderId({
      chatId: "123", text: "4524974695110983001", cart: { orderId: "order-1", messageId: 88 },
    });
    expect(mocks.submit).toHaveBeenCalledWith({ orderId: "order-1", chatId: "123", submittedOrderId: "4524974695110983001" });
    const screen = mocks.render.mock.calls[0][0];
    expect(screen.text).toContain("Binance payment verified");
    expect(screen.replyMarkup.inline_keyboard.flat().some((button: { copy_text?: unknown }) => button.copy_text)).toBe(false);
  });
});
