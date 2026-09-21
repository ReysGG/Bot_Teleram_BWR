import { describe, expect, it } from "vitest";
import {
  expiredOrderWalletCreditAmount,
  isExpiredOrderWalletCreditPaymentMethod,
} from "@/server/wallet/expired-order-credit";

describe("expired order wallet credit amount", () => {
  it("supports DANA and Bank Jago orders but not direct crypto providers", () => {
    expect(isExpiredOrderWalletCreditPaymentMethod("DANA_RELAY")).toBe(true);
    expect(isExpiredOrderWalletCreditPaymentMethod("WALLET_QRIS")).toBe(true);
    expect(isExpiredOrderWalletCreditPaymentMethod("JAGO_TRANSFER")).toBe(true);
    expect(isExpiredOrderWalletCreditPaymentMethod("BINANCE_INTERNAL")).toBe(false);
  });

  it("removes the unique payment code from the amount received", () => {
    expect(
      expiredOrderWalletCreditAmount({
        billedAmount: 37_021,
        uniqueCode: 21,
        serviceFee: 21,
      }),
    ).toBe(37_000);
  });

  it("credits only the external remainder for a hybrid wallet and QRIS order", () => {
    expect(
      expiredOrderWalletCreditAmount({
        billedAmount: 6_827,
        uniqueCode: 27,
        serviceFee: 27,
      }),
    ).toBe(6_800);
  });

  it("falls back to the order service fee for older payments without a unique code", () => {
    expect(
      expiredOrderWalletCreditAmount({
        billedAmount: 37_021,
        uniqueCode: null,
        serviceFee: 21,
      }),
    ).toBe(37_000);
  });

  it.each([
    {
      name: "zero credit",
      input: { billedAmount: 21, uniqueCode: 21, serviceFee: 21 },
    },
    {
      name: "negative credit",
      input: { billedAmount: 20, uniqueCode: 21, serviceFee: 21 },
    },
    {
      name: "negative unique code",
      input: { billedAmount: 37_021, uniqueCode: -1, serviceFee: -1 },
    },
    {
      name: "fractional billed amount",
      input: { billedAmount: 37_021.5, uniqueCode: 21, serviceFee: 21 },
    },
    {
      name: "invalid fallback service fee",
      input: { billedAmount: 37_021, uniqueCode: null, serviceFee: Number.NaN },
    },
  ])("rejects $name", ({ input }) => {
    expect(() => expiredOrderWalletCreditAmount(input)).toThrow(
      "Nominal pembayaran expired tidak valid",
    );
  });
});
