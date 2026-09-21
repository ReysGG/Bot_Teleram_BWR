import { describe, expect, it } from "vitest";
import { webProductGuidance } from "@/server/storefront/product-guidance";
const item = { productId: "p", productNameSnapshot: "Produk contoh", product: { postDeliveryInstructions: "Buka panduan", postDeliveryEntities: [{ type: "text_link", offset: 0, length: 12, url: "https://example.com/guide" }], redeemUrl: "https://example.com/claim" } };
const paid = { channel: "WEB", paymentStatus: "PAID", orderStatus: "COMPLETED", items: [item] };
describe("private web product guidance", () => {
  it.each(["COMPLETED", "FULFILLING", "PAID_WAITING_STOCK"])("includes formatted instructions and redeem URL for paid %s", orderStatus => {
    expect(webProductGuidance({ ...paid, orderStatus })[0]).toMatchObject({ text: "Buka panduan", redeemUrl: "https://example.com/claim", entities: [expect.objectContaining({ type: "text_link" })] });
  });
  it.each(["PENDING_PAYMENT", "EXPIRED", "CANCELLED", "REFUNDED"])("does not expose private URLs for %s", orderStatus => {
    expect(webProductGuidance({ ...paid, orderStatus })).toEqual([]);
  });
  it("requires a paid Web order", () => {
    expect(webProductGuidance({ ...paid, paymentStatus: "PENDING" })).toEqual([]);
    expect(webProductGuidance({ ...paid, channel: "TELEGRAM" })).toEqual([]);
  });
  it("supports URL-only products and deduplicates the same product", () => {
    const onlyUrl = { ...item, product: { ...item.product, postDeliveryInstructions: null, postDeliveryEntities: null } };
    expect(webProductGuidance({ ...paid, items: [onlyUrl, onlyUrl] })).toEqual([{ productId: "p", productName: "Produk contoh", text: "", entities: [], redeemUrl: "https://example.com/claim" }]);
  });
  it("keeps readable legacy text but excludes invalid metadata and dangerous URL schemes", () => {
    const legacy = { ...item, product: { postDeliveryInstructions: "Petunjuk", postDeliveryEntities: [{ type: "text_link", offset: 900, length: 1, url: "javascript:alert(1)" }], redeemUrl: "javascript:alert(1)" } };
    expect(webProductGuidance({ ...paid, items: [legacy] })[0]).toMatchObject({ text: "Petunjuk", entities: [], redeemUrl: null });
  });
});
