import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  order: { channel: "WEB", status: "COMPLETED", paymentStatus: "PAID", webCustomerId: "customer", payment: { status: "PAID" }, deliveryReceipts: [{ stockItemId: "s1", channel: "WEB", status: "SENT" }], items: [{ stockItemId: "s1", productNameSnapshot: "Produk contoh" }], buyerUsername: "private@example.com", buyerDisplayName: "Private Name", grandTotal: 55011 },
  row: { status: "PROCESSING", messageText: null as string | null },
  sendMessage: vi.fn(), update: vi.fn(), updateMany: vi.fn(),
}));
vi.mock("@/server/db/prisma", () => ({ prisma: { order: { findUnique: async () => mocks.order }, telegramNotification: { findMany: async () => [], update: mocks.update, updateMany: mocks.updateMany } } }));
vi.mock("@/server/telegram/api", async importOriginal => ({ ...await importOriginal<typeof import("@/server/telegram/api")>(), sendMessage: mocks.sendMessage }));
import { processSuccessChannel } from "@/server/telegram/delivery-worker";
import { TelegramApiError } from "@/server/telegram/api";
import { WEB_SUCCESS_DISPATCH_MARKER } from "@/server/storefront/success-announcement";
const notice = () => ({ id: "notification", orderId: "order", chatId: "-100000000123", kind: "SUCCESS_CHANNEL", attempts: 1, messageText: null, dedupeKey: "success-channel:order:order" }) as Parameters<typeof processSuccessChannel>[0];
beforeEach(() => {
  mocks.row = { status: "PROCESSING", messageText: null };
  mocks.order.channel = "WEB"; mocks.order.status = "COMPLETED";
  mocks.sendMessage.mockReset().mockResolvedValue({ message_id: 123 });
  mocks.update.mockReset().mockImplementation(async ({ data }) => Object.assign(mocks.row, data));
  mocks.updateMany.mockReset().mockImplementation(async ({ where, data }) => {
    if (where.status && where.status !== mocks.row.status) return { count: 0 };
    if (Object.hasOwn(where, "messageText") && where.messageText !== mocks.row.messageText) return { count: 0 };
    Object.assign(mocks.row, data); return { count: 1 };
  });
});
afterEach(() => { delete process.env.STOREFRONT_PUBLIC_URL; });
describe("Web public success announcement dispatch", () => {
  it("sends website name, thanks and the website button without buyer identity", async () => {
    expect(await processSuccessChannel(notice())).toBe("sent");
    expect(mocks.sendMessage).toHaveBeenCalledTimes(1);
    const [, text, keyboard] = mocks.sendMessage.mock.calls[0];
    expect(text).toContain("Website BWR Tele"); expect(text).toContain("Terima kasih"); expect(text).not.toContain("private@example.com"); expect(text).not.toContain("Private Name");
    expect(keyboard.inline_keyboard[0][0].url).toBe("https://store.buildwithreys.com");
    expect(mocks.row.status).toBe("SENT");
  });
  it("refuses incomplete orders without dispatching", async () => {
    mocks.order.status = "FULFILLING";
    expect(await processSuccessChannel(notice())).toBe("manual_review"); expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
  it("does not dispatch twice after a worker crash left an attempt marker", async () => {
    mocks.row.messageText = WEB_SUCCESS_DISPATCH_MARKER;
    expect(await processSuccessChannel(notice())).toBe("manual_review"); expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
  it("permits a safe retry after a definite rate-limit rejection", async () => {
    mocks.sendMessage.mockRejectedValueOnce(new TelegramApiError("Too many requests", true, 5, true, 429));
    expect(await processSuccessChannel(notice())).toBe("retry"); expect(mocks.row.messageText).toBeNull();
    mocks.row.status = "PROCESSING";
    expect(await processSuccessChannel(notice())).toBe("sent"); expect(mocks.sendMessage).toHaveBeenCalledTimes(2);
  });
  it("holds ambiguous delivery or accepted-but-uncommitted sends for review", async () => {
    mocks.sendMessage.mockRejectedValueOnce(new TelegramApiError("Connection interrupted", false));
    expect(await processSuccessChannel(notice())).toBe("manual_review"); expect(mocks.row.messageText).toBe(WEB_SUCCESS_DISPATCH_MARKER);
    mocks.row = { status: "PROCESSING", messageText: null };
    mocks.update.mockRejectedValueOnce(new Error("Commit failed"));
    expect(await processSuccessChannel(notice())).toBe("manual_review"); expect(mocks.row.messageText).toBe(WEB_SUCCESS_DISPATCH_MARKER);
  });
  it("keeps Telegram purchases directed to the bot with refreshed wording", async () => {
    mocks.order.channel = "TELEGRAM";
    expect(await processSuccessChannel(notice())).toBe("sent");
    expect(mocks.sendMessage.mock.calls[0][1]).toContain("Pesanan beres di BWR Tele");
    expect(mocks.sendMessage.mock.calls[0][2].inline_keyboard[0][0].url).toContain("https://t.me/");
  });
});
