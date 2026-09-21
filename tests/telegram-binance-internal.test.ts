import { describe, expect, it } from "vitest";
import {
  binanceInternalCopyButtons,
  binanceInternalInvoiceText,
  binanceInternalLocksCancellation,
  binanceInternalOrderIdPromptText,
  binanceInternalPublicErrorText,
  binanceInternalStatusText,
} from "@/server/telegram/flows/payment/binance-internal-presentation";

describe("Telegram Binance Pay presentation", () => {
  const invoice = {
    invoiceNumber: "TGS-BINANCE-001",
    productName: "ChatGPT Team",
    quantity: 2,
    amountUsdtMicros: 20_000_091,
    recipientBinanceId: "567896636",
    expiresAt: new Date("2026-08-18T05:00:00.000Z"),
  };

  it("shows the exact amount and recipient Binance ID without backend details", () => {
    const text = binanceInternalInvoiceText({ locale: "id", ...invoice });

    expect(text).toContain("Binance-to-Binance");
    expect(text).toContain("Jangan pilih jaringan BSC/BEP20");
    expect(text).toContain("20.000091 USDT");
    expect(text).toContain(invoice.recipientBinanceId);
    expect(text).toContain("Order ID");
    expect(text).not.toMatch(/API key|secret|saldo akun|endpoint/i);
  });

  it.each(["id", "en"] as const)("copies unformatted exact payment details in %s", (locale) => {
    const buttons = binanceInternalCopyButtons({
      locale,
      recipientBinanceId: invoice.recipientBinanceId,
      amountUsdtMicros: 1_234_500_001,
    });
    expect(buttons.map((button) => button.copy_text?.text)).toEqual([
      invoice.recipientBinanceId,
      "1234.500001",
    ]);
  });

  it("requires the Binance Pay Order ID instead of a transaction hash", () => {
    const indonesian = binanceInternalOrderIdPromptText("id", invoice.invoiceNumber);
    const english = binanceInternalOrderIdPromptText("en", invoice.invoiceNumber);

    expect(indonesian).toContain("Order ID Binance Pay");
    expect(indonesian).toContain("448515289526009856");
    expect(english).toContain("Payment Details");
    expect(indonesian).not.toMatch(/tx hash|0x/i);
  });

  it("shows safe verification status and the submitted ID", () => {
    const text = binanceInternalStatusText({
      locale: "id",
      status: "VERIFYING",
      submittedOrderId: "448515289526009856",
    });

    expect(text).toContain("sedang diverifikasi");
    expect(text).toContain("448515289526009856");
    expect(text).not.toMatch(/API|secret|provider balance/i);
  });

  it("locks cancellation after verification starts", () => {
    expect(binanceInternalLocksCancellation("AWAITING_ORDER_ID")).toBe(false);
    expect(binanceInternalLocksCancellation("VERIFYING")).toBe(true);
    expect(binanceInternalLocksCancellation("VERIFIED")).toBe(true);
    expect(binanceInternalLocksCancellation("CONFIRMED")).toBe(true);
    expect(binanceInternalLocksCancellation("REJECTED")).toBe(false);
  });

  it("uses safe localized validation errors", () => {
    expect(binanceInternalPublicErrorText("id", "ORDER_ID_ALREADY_USED")).toContain(
      "sudah digunakan",
    );
    expect(binanceInternalPublicErrorText("en", "UNKNOWN_INTERNAL_CODE")).not.toMatch(
      /API|secret|balance|endpoint/i,
    );
  });
});
