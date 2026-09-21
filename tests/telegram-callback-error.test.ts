import { describe, expect, it } from "vitest";
import { ActiveInvoiceError, ActiveInvoiceLimitError } from "@/server/checkout/errors";
import { callbackErrorContent } from "@/server/telegram/callback-error";

describe("Telegram callback recovery", () => {
  it.each(["id", "en"] as const)("links the actual active invoice in %s", (locale) => {
    const screen = callbackErrorContent(new ActiveInvoiceError("order-1", "TEST-001"), locale);
    expect(screen.text).toContain("TEST-001");
    expect(screen.text).not.toMatch(/Permintaan belum|could not be processed/);
    expect(screen.replyMarkup.inline_keyboard[0][0]).toMatchObject({ callback_data: "order:order-1" });
    expect(screen.text).toContain(locale === "en" ? "active invoice" : "invoice aktif");
  });

  it("keeps unexpected internal errors private in both languages", () => {
    for (const locale of ["id", "en"] as const) {
      expect(callbackErrorContent(new Error("Database connection failed with internal details"), locale).text)
        .not.toMatch(/Database|connection|internal/);
    }
  });

  it("gives English users a localized stock failure", () => {
    const screen = callbackErrorContent(new Error("Stok tidak tersedia"), "en");
    expect(screen.text).toContain("stock is unavailable");
    expect(screen.text).not.toContain("tidak tersedia");
  });

  it("explains an unready Shopee QRIS setup instead of showing a generic error", () => {
    const screen = callbackErrorContent(
      new Error("Merchant QRIS Shopee belum diikat ke akun Shopee Partner"),
      "id",
    );
    expect(screen.text).toContain("QRIS Shopee belum siap");
    expect(screen.text).not.toContain("Permintaan belum dapat diproses");
  });
});

it.each(["id", "en"] as const)("offers all pending invoices when the %s buyer reaches the limit", locale => {
  const content = callbackErrorContent(new ActiveInvoiceLimitError(5), locale);
  expect(content.text).toContain("5");
  expect(content.replyMarkup.inline_keyboard[0][0]).toMatchObject({callback_data:"orders"});
  expect(content.replyMarkup.inline_keyboard[1][0]).toMatchObject({callback_data:"catalog"});
});
