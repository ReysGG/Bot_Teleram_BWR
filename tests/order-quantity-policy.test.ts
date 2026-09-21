import { describe, expect, it } from "vitest";
import {
  assertOrderQuantityWithinCapacity,
  DEFAULT_MAX_ORDER_QUANTITY,
  getMaxOrderQuantity,
  HARD_MAX_ORDER_QUANTITY,
  normalizeOrderQuantity,
  OrderQuantityError,
  resolveOrderQuantityCapacity,
} from "@/server/checkout/order-quantity";

function quantityError(action: () => unknown): OrderQuantityError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(OrderQuantityError);
    return error as OrderQuantityError;
  }
  throw new Error("Expected OrderQuantityError");
}

describe("order quantity policy", () => {
  it("accepts 598 with the safe default and caps configuration absolutely", () => {
    expect(DEFAULT_MAX_ORDER_QUANTITY).toBeGreaterThanOrEqual(598);
    expect(HARD_MAX_ORDER_QUANTITY).toBe(DEFAULT_MAX_ORDER_QUANTITY);
    expect(getMaxOrderQuantity(undefined)).toBe(DEFAULT_MAX_ORDER_QUANTITY);
    expect(getMaxOrderQuantity(" 650 ")).toBe(650);
    expect(getMaxOrderQuantity("999999")).toBe(HARD_MAX_ORDER_QUANTITY);
    expect(getMaxOrderQuantity("invalid")).toBe(DEFAULT_MAX_ORDER_QUANTITY);
    expect(normalizeOrderQuantity(598, DEFAULT_MAX_ORDER_QUANTITY)).toBe(598);
  });

  it("distinguishes non-integer, minimum, and global-limit failures", () => {
    expect(quantityError(() => normalizeOrderQuantity(1.5)).code).toBe(
      "QUANTITY_NOT_INTEGER",
    );
    expect(quantityError(() => normalizeOrderQuantity(0)).code).toBe(
      "QUANTITY_BELOW_MINIMUM",
    );
    expect(
      quantityError(() =>
        normalizeOrderQuantity(HARD_MAX_ORDER_QUANTITY + 1),
      ).code,
    ).toBe("QUANTITY_ABOVE_GLOBAL_LIMIT");
  });

  it("uses stock or preorder capacity without adding incompatible paths", () => {
    expect(
      resolveOrderQuantityCapacity({
        readyStock: 598,
        reservedStock: 0,
        preorderEnabled: false,
        preorderLimit: null,
        activePreorders: 0,
      }),
    ).toEqual({ maxQuantity: 598, readyStock: 598, preorderSlots: 0 });

    expect(
      resolveOrderQuantityCapacity({
        readyStock: 100,
        reservedStock: 0,
        preorderEnabled: true,
        preorderLimit: 700,
        activePreorders: 200,
      }),
    ).toEqual({ maxQuantity: 500, readyStock: 100, preorderSlots: 500 });

    expect(
      resolveOrderQuantityCapacity({
        readyStock: 100,
        reservedStock: 3,
        preorderEnabled: true,
        preorderLimit: null,
        activePreorders: 0,
      }),
    ).toEqual({ maxQuantity: 100, readyStock: 100, preorderSlots: null });

    expect(
      resolveOrderQuantityCapacity({
        readyStock: 100,
        reservedStock: 0,
        preorderEnabled: true,
        preorderLimit: null,
        activePreorders: 0,
        configuredMaximum: 0,
      }).maxQuantity,
    ).toBe(0);
  });

  it("distinguishes a product capacity failure from the global ceiling", () => {
    const capacity = resolveOrderQuantityCapacity({
      readyStock: 120,
      reservedStock: 0,
      preorderEnabled: false,
      preorderLimit: null,
      activePreorders: 0,
    });
    const error = quantityError(() =>
      assertOrderQuantityWithinCapacity(598, capacity),
    );
    expect(error.code).toBe("QUANTITY_ABOVE_PRODUCT_CAPACITY");
    expect(error.message).toContain("Maksimal 120");
  });
});
