import { afterEach, describe, expect, it, vi } from "vitest";
import { completedWebOrderCanAnnounce, queueWebSuccessAnnouncement } from "@/server/storefront/success-announcement";
import type { Prisma } from "@/generated/prisma/client";
import { digitalPurchaseSuccessMessage, storefrontPublicUrl } from "@/server/telegram/success-channel";

const completed = { channel: "WEB", status: "COMPLETED", paymentStatus: "PAID", webCustomerId: "customer", payment: { status: "PAID" }, items: [{ stockItemId: "stock" }], deliveryReceipts: [{ stockItemId: "stock", channel: "WEB", status: "SENT" }] };
afterEach(() => { delete process.env.TELEGRAM_SUCCESS_CHANNEL_ID; delete process.env.STOREFRONT_PUBLIC_URL; });
describe("website success-channel policy", () => {
  it("requires paid, complete delivery to the Web order", () => {
    expect(completedWebOrderCanAnnounce(completed)).toBe(true);
    for (const status of ["PENDING_PAYMENT", "FULFILLING", "REFUNDED", "CANCELLED", "EXPIRED"]) expect(completedWebOrderCanAnnounce({ ...completed, status })).toBe(false);
    expect(completedWebOrderCanAnnounce({ ...completed, paymentStatus: "PENDING" })).toBe(false);
    expect(completedWebOrderCanAnnounce({ ...completed, payment: null })).toBe(false);
    expect(completedWebOrderCanAnnounce({ ...completed, deliveryReceipts: [{ stockItemId: "other", channel: "WEB", status: "SENT" }] })).toBe(false);
    expect(completedWebOrderCanAnnounce({ ...completed, deliveryReceipts: [{ stockItemId: "stock", channel: "TELEGRAM", status: "SENT" }] })).toBe(false);
    expect(completedWebOrderCanAnnounce({ ...completed, deliveryReceipts: [{ stockItemId: "stock", channel: "WEB", status: "READY" }] })).toBe(false);
  });
  it("queues only the public channel announcement using a stable key", async () => {
    const upsert = vi.fn(); const tx = { telegramNotification: { upsert } } as unknown as Prisma.TransactionClient;
    await queueWebSuccessAnnouncement(tx, "order-1"); expect(upsert).not.toHaveBeenCalled();
    process.env.TELEGRAM_SUCCESS_CHANNEL_ID = "-100000000123";
    await queueWebSuccessAnnouncement(tx, "order-1");
    expect(upsert).toHaveBeenCalledWith({ where: { dedupeKey: "success-channel:order:order-1" }, create: { dedupeKey: "success-channel:order:order-1", chatId: "-100000000123", orderId: "order-1", kind: "SUCCESS_CHANNEL", priority: 80 }, update: {} });
  });
  it("includes website name, public URL and thanks without buyer secrets", () => {
    const text = digitalPurchaseSuccessMessage({ channel: "WEB", buyer: "private@example.com", productNames: ["ChatGPT Business", "access_token=private"], total: 55011, quantity: 2 });
    expect(text).toContain("Website BWR Tele"); expect(text).toContain("https://store.buildwithreys.com");
    expect(text).toContain("Terima kasih sudah belanja di BWR Tele."); expect(text).toContain("Semoga produknya membantu aktivitasmu!");
    expect(text).not.toContain("private"); expect(text).not.toContain("PEMBELIAN SUKSES"); expect(text).not.toContain("Chat bot sekarang");
  });
  it("rejects private/authenticated or unsafe website addresses", () => {
    for (const value of ["http://example.com", "https://user:pass@example.com", "https://example.com/?token=secret", "javascript:alert(1)"]) expect(() => storefrontPublicUrl(value)).toThrow();
    expect(storefrontPublicUrl("https://shop.example.com/")).toBe("https://shop.example.com");
  });
});
