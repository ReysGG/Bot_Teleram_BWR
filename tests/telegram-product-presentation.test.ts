import { describe, expect, it } from "vitest";
import {
  digitalDeliveryCaption,
  groupedDeliveryCaption,
  paymentSuccessMessage,
  productDisplayName,
  productEmoji,
} from "@/server/telegram/product-presentation";

describe("Telegram product presentation", () => {
  it("uses recognizable, stable emoji for common AI products", () => {
    expect(productEmoji("ChatGPT Team")).toBe("🤖");
    expect(productEmoji("Claude Pro")).toBe("🧠");
    expect(productEmoji("Gemini Advanced")).toBe("✨");
    expect(productEmoji("Produk lain")).toBe("🧩");
    expect(productDisplayName("ChatGPT Team")).toBe("ChatGPT Team");
    expect(productDisplayName("🤖 ChatGPT Team")).toBe("🤖 ChatGPT Team");
  });

  it("keeps the temporary payment state concise while delivery is pending", () => {
    const message = paymentSuccessMessage({
      invoiceNumber: "TGS-001",
      quantity: 2,
      grandTotal: 12_345,
      isPreorder: false,
    });

    expect(message).toContain("Pembayaran diterima");
    expect(message).toContain("Produk sedang disiapkan");
    expect(message).not.toContain("Terima kasih sudah berbelanja");
    expect(message).toContain("12.345");
    expect(message).not.toContain("worker");
    expect(message).not.toContain("database");
  });

  it("renders payment and delivery copy in English when selected", () => {
    const payment = paymentSuccessMessage({
      invoiceNumber: "TGS-EN",
      quantity: 1,
      grandTotal: 18_500,
      isPreorder: false,
      locale: "en",
    });
    const delivery = digitalDeliveryCaption({
      productName: "Claude Pro",
      invoiceNumber: "TGS-EN",
      unitNumber: 1,
      totalUnits: 1,
      locale: "en",
    });

    expect(payment).toContain("Payment received");
    expect(payment).not.toContain("Thank you for your purchase");
    expect(delivery).toContain("Product file");
    expect(delivery).not.toContain("Thank you for shopping");
  });

  it("keeps every file caption concise without repeating the final summary", () => {
    const first = digitalDeliveryCaption({
      productName: "ChatGPT Team",
      invoiceNumber: "TGS-002",
      unitNumber: 1,
      totalUnits: 2,
    });
    const last = digitalDeliveryCaption({
      productName: "ChatGPT Team",
      invoiceNumber: "TGS-002",
      unitNumber: 2,
      totalUnits: 2,
    });

    expect(first).toContain("ChatGPT Team");
    expect(first).not.toContain("🤖 ChatGPT Team");
    expect(first).not.toContain("Terima kasih");
    expect(last).not.toContain("Terima kasih");
  });

  it("describes a grouped delivery as one customer-friendly file", () => {
    const caption = groupedDeliveryCaption({
      productNames: ["Claude Pro", "Claude Pro"],
      invoiceNumber: "TGS-003",
      quantity: 5,
      format: "K12",
    });

    expect(caption).toContain("Claude Pro");
    expect(caption).not.toContain("🧠 Claude Pro");
    expect(caption).toContain("5 item dalam 1 file");
    expect(caption.match(/Claude Pro/g)).toHaveLength(1);
  });

  it("labels large-order ranges and explains the ZIP fallback", () => {
    const first = groupedDeliveryCaption({
      productNames: ["ChatGPT K12", "Setup guide PDF"],
      invoiceNumber: "TGS-598",
      quantity: 100,
      format: "ZIP",
      unitStart: 1,
      unitEnd: 100,
      totalUnits: 598,
    });
    const final = groupedDeliveryCaption({
      productNames: ["ChatGPT K12"],
      invoiceNumber: "TGS-598",
      quantity: 98,
      format: "K12",
      unitStart: 501,
      unitEnd: 598,
      totalUnits: 598,
    });

    expect(first).toContain("Bagian: 1-100 / 598");
    expect(first).toContain("arsip ZIP");
    expect(first).not.toContain("Terima kasih");
    expect(final).toContain("Bagian: 501-598 / 598");
    expect(final).not.toContain("Terima kasih");
  });
});
