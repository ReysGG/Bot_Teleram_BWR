import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  order: { id: "o1", chatId: "12345", status: "COMPLETED", paymentStatus: "PAID", payment: { status: "PAID" }, grandTotal: 500,
    items: [{ productId: "p1", stockItemId: "s1" }], deliveryReceipts: [{ stockItemId: "s1", chatId: "12345", status: "SENT" }] },
  edit: vi.fn(), send: vi.fn(), receipt: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: {
  order: { findUnique: async () => mocks.order },
  sentDelivery: { findFirst: mocks.receipt },
  telegramNotification: { findMany: async () => [], update: mocks.update, updateMany: mocks.updateMany },
} }));
vi.mock("@/server/telegram/locale-store", () => ({ telegramLocaleForChat: async () => "id" }));
vi.mock("@/server/telegram/api", async original => ({ ...await original<typeof import("@/server/telegram/api")>(),
  editMessageCaption: mocks.edit, sendMessage: mocks.send, sendDocument: mocks.send,
}));
import { processProductPostDelivery } from "@/server/telegram/delivery-worker";
import { TelegramApiError } from "@/server/telegram/api";
import { serializeProductPostDeliverySnapshot } from "@/server/products/post-delivery";
const notice = (instructions = "") => ({
  id: "n1", chatId: "12345", orderId: "o1", productId: "p1", kind: "PRODUCT_POST_DELIVERY", attempts: 1,
  messageText: serializeProductPostDeliverySnapshot({ productName: "Temp Mail", invoiceNumber: "TGS-TEST", redeemUrl: null, instructions }),
}) as Parameters<typeof processProductPostDelivery>[0];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.chatId = "12345";
  mocks.receipt.mockResolvedValue({ telegramMessageId: "91" });
  mocks.edit.mockResolvedValue({ message_id: 91 });
  mocks.update.mockResolvedValue({}); mocks.updateMany.mockResolvedValue({ count: 1 });
});
describe("single-message purchase completion", () => {
  it("edits only the acknowledged document with summary, guide and controls", async () => {
    expect(await processProductPostDelivery(notice("Buka tautan untuk klaim."))).toBe("sent");
    expect(mocks.edit).toHaveBeenCalledWith(expect.objectContaining({ messageId: 91, chatId: "12345",
      caption: expect.stringContaining("File produk terlampir pada pesan ini.") }));
    expect(mocks.edit.mock.calls[0][0].caption).toContain("Buka tautan untuk klaim.");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps long instructions behind an explicit button without truncating the saved guide", async () => {
    expect(await processProductPostDelivery(notice("Panduan panjang. ".repeat(100)))).toBe("sent");
    const caption = mocks.edit.mock.calls[0][0];
    expect(caption.caption.length).toBeLessThanOrEqual(1024);
    expect(caption.replyMarkup.inline_keyboard.flat()).toContainEqual({ text: "Baca panduan lengkap", callback_data: "delivery_guide:n1" });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("treats an already-applied caption as success after a retry", async () => {
    mocks.edit.mockRejectedValue(new TelegramApiError("Bad Request: message is not modified", true, undefined, false, 400));
    expect(await processProductPostDelivery(notice())).toBe("sent");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not replace missing or ambiguous delivery messages with a new file", async () => {
    mocks.receipt.mockResolvedValue(null);
    expect(await processProductPostDelivery(notice())).toBe("manual_review");
    expect(mocks.edit).not.toHaveBeenCalled();
    mocks.receipt.mockResolvedValue({ telegramMessageId: "91" });
    mocks.edit.mockRejectedValue(new TelegramApiError("Unknown outcome", false));
    expect(await processProductPostDelivery(notice())).toBe("manual_review");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects another recipient before editing any message", async () => {
    mocks.order.chatId = "99999";
    expect(await processProductPostDelivery(notice())).toBe("manual_review");
    expect(mocks.edit).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
});
