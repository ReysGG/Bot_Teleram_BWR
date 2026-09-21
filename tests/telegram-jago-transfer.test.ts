import { describe, expect, it } from "vitest";
import {
  jagoTransferCopyButtonRow,
  jagoTransferInvoiceText,
  jagoTransferPaymentOptionLabel,
  jagoTransferStatusText,
} from "@/server/telegram/flows/payment/jago-transfer-presentation";

describe("Telegram Bank Jago presentation", () => {
  const invoice = {
    invoiceNumber: "TGS-JAGO-001",
    productName: "ChatGPT Team",
    quantity: 2,
    billedAmount: 25_091,
    recipientAccountNumber: "123456789012",
    expiresAt: new Date("2026-08-21T14:10:00.000Z"),
  };

  it("shows exact Rupiah amount and configured account number", () => {
    const text = jagoTransferInvoiceText({ locale: "id", ...invoice });
    expect(text).toContain("25.091");
    expect(text).toContain(invoice.recipientAccountNumber);
    expect(text).toContain("terdeteksi otomatis");
    expect(text).not.toMatch(/secret|API key|saldo rekening|package name/i);
  });

  it("copies raw account and amount values that banking apps can paste", () => {
    const row = jagoTransferCopyButtonRow({ locale: "id", ...invoice });

    expect(row).toEqual([
      {
        text: "📋 Salin rekening",
        copy_text: { text: invoice.recipientAccountNumber },
      },
      {
        text: "📋 Salin nominal",
        copy_text: { text: "25091" },
      },
    ]);
    expect(row[1]?.copy_text?.text).not.toMatch(/Rp|\./);
  });

  it("localizes the Bank Jago copy buttons", () => {
    const row = jagoTransferCopyButtonRow({ locale: "en", ...invoice });

    expect(row.map((button) => button.text)).toEqual([
      "📋 Copy account",
      "📋 Copy amount",
    ]);
  });

  it("shows automatic pending and success states", () => {
    expect(jagoTransferStatusText({ locale: "id", status: "AWAITING_TRANSFER" }))
      .toContain("Menunggu notifikasi transfer masuk");
    expect(jagoTransferStatusText({ locale: "id", status: "CONFIRMED" }))
      .toContain("Terima kasih");
  });

  it("provides a localized payment option", () => {
    expect(jagoTransferPaymentOptionLabel("id")).toContain("Bank Jago");
    expect(jagoTransferPaymentOptionLabel("en")).toContain("Bank Jago");
  });
});
