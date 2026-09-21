import { describe, expect, it } from "vitest";
import {
  usdtBep20HashPromptText,
  usdtBep20InvoiceText,
  usdtBep20LocksCancellation,
  usdtBep20PublicErrorText,
  usdtBep20StatusText,
} from "@/server/telegram/flows/payment/usdt-bep20-presentation";

describe("Telegram USDT BEP20 presentation", () => {
  const invoice = {
    invoiceNumber: "TGS-USDT-001",
    productName: "ChatGPT Team",
    quantity: 2,
    amountUsdtMicros: 5_125_000,
    recipientAddress: "0x1111111111111111111111111111111111111111",
    expiresAt: new Date("2026-08-18T05:00:00.000Z"),
  };

  it("shows only the safe public BEP20 payment details", () => {
    const text = usdtBep20InvoiceText({ locale: "id", ...invoice });

    expect(text).toContain("BNB Smart Chain mainnet (BEP20)");
    expect(text).toContain("5.125 USDT");
    expect(text).toContain(invoice.recipientAddress);
    expect(text).toContain("QR hanya berisi alamat penerima");
    expect(text).toContain("sama persis");
    expect(text).not.toMatch(/RPC|API key|saldo|provider/i);
  });

  it("asks for a transaction hash, never a Binance Order ID", () => {
    const indonesian = usdtBep20HashPromptText("id", invoice.invoiceNumber);
    const english = usdtBep20HashPromptText("en", invoice.invoiceNumber);

    expect(indonesian).toContain("transaction hash 0x");
    expect(english).toContain("0x transaction hash");
    expect(indonesian).not.toContain("Binance Order ID");
  });

  it("shows confirmation progress without exposing verifier internals", () => {
    const text = usdtBep20StatusText({
      locale: "id",
      status: "PENDING_CONFIRMATIONS",
      transactionHash: `0x${"a".repeat(64)}`,
      confirmations: 2,
      requiredConfirmations: 5,
    });

    expect(text).toContain("Konfirmasi 2/5");
    expect(text).not.toMatch(/RPC|endpoint|provider/i);
  });

  it("uses a safe public failure message", () => {
    const text = usdtBep20StatusText({ locale: "en", status: "REJECTED" });

    expect(text).toContain("could not be verified");
    expect(text).not.toMatch(/balance|timeout|RPC|API/i);
  });

  it("blocks cancellation after on-chain verification starts", () => {
    expect(usdtBep20LocksCancellation("AWAITING_TX_HASH")).toBe(false);
    expect(usdtBep20LocksCancellation("VERIFYING")).toBe(true);
    expect(usdtBep20LocksCancellation("PENDING_CONFIRMATIONS")).toBe(true);
    expect(usdtBep20LocksCancellation("VERIFIED")).toBe(true);
    expect(usdtBep20LocksCancellation("CONFIRMED")).toBe(true);
    expect(usdtBep20LocksCancellation("REJECTED")).toBe(false);
  });

  it("localizes verifier errors without exposing backend details", () => {
    expect(usdtBep20PublicErrorText("en", "INVALID_TX_HASH")).toContain(
      "64 hexadecimal",
    );
    expect(usdtBep20PublicErrorText("id", "TX_HASH_ALREADY_USED")).toContain(
      "sudah digunakan",
    );
    expect(usdtBep20PublicErrorText("en", "UNKNOWN_INTERNAL_CODE")).not.toMatch(
      /RPC|provider|balance/i,
    );
  });
});
