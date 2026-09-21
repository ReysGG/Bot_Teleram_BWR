import { describe, expect, it } from "vitest";
import {
  HARD_MAX_ORDER_QUANTITY,
  normalizeOrderQuantity,
} from "@/server/checkout/create-order";
import {
  parsePendingQuantitySelection,
  parseQuantityCallback,
} from "@/server/telegram/session-state";

describe("custom order quantity", () => {
  it("accepts any whole quantity within the configured safe limit", () => {
    expect(normalizeOrderQuantity(1)).toBe(1);
    expect(normalizeOrderQuantity(7)).toBe(7);
    expect(normalizeOrderQuantity(50)).toBe(50);
    expect(normalizeOrderQuantity(598)).toBe(598);
    expect(normalizeOrderQuantity(HARD_MAX_ORDER_QUANTITY)).toBe(750);
  });

  it("rejects zero, fractions, and excessive quantities", () => {
    expect(() => normalizeOrderQuantity(0)).toThrow();
    expect(() => normalizeOrderQuantity(1.5)).toThrow();
    expect(() => normalizeOrderQuantity(751)).toThrow();
  });

  it("parses only exact quantity callbacks", () => {
    expect(parseQuantityCallback("qty:product-1:7", "qty:")).toEqual({
      productId: "product-1",
      quantity: 7,
    });
    expect(() => parseQuantityCallback("qty:product-1:7:extra", "qty:")).toThrow(
      "Pilihan jumlah tidak valid",
    );
    expect(() => parseQuantityCallback("qty:product-1:7x", "qty:")).toThrow(
      "Pilihan jumlah tidak valid",
    );
  });

  it("keeps only validated catalog return callbacks in quantity state", () => {
    expect(parsePendingQuantitySelection({
      productId: "product-1",
      messageId: 71,
      returnCallback: "group_page:chatgpt:3",
    })).toEqual({
      productId: "product-1",
      messageId: 71,
      returnCallback: "group_page:chatgpt:3",
    });
    expect(parsePendingQuantitySelection({
      productId: "product-1",
      messageId: 71,
      returnCallback: "pay_wallet:other-product:10",
    })).toBeNull();
  });
});
