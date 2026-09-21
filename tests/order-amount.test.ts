import { describe, expect, it } from "vitest";
import {
  assertOrderTotalCapacity,
  assertStoredOrderAmount,
  calculateOrderSubtotal,
  maxOrderQuantityForUnitPrice,
  OrderAmountError,
  POSTGRESQL_INT_MAX,
} from "@/server/checkout/order-amount";

function amountError(action: () => unknown): OrderAmountError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(OrderAmountError);
    return error as OrderAmountError;
  }
  throw new Error("Expected OrderAmountError");
}

describe("stored order amount policy", () => {
  it("accepts values through the PostgreSQL int32 ceiling", () => {
    expect(assertStoredOrderAmount(POSTGRESQL_INT_MAX)).toBe(
      POSTGRESQL_INT_MAX,
    );
    expect(calculateOrderSubtotal(1_000_000, 598)).toBe(598_000_000);
    expect(maxOrderQuantityForUnitPrice(1_000_000_000)).toBe(2);
    expect(maxOrderQuantityForUnitPrice(1_000_000_000, 0)).toBe(2);
    expect(() =>
      assertOrderTotalCapacity(POSTGRESQL_INT_MAX - 99, 99),
    ).not.toThrow();
  });

  it("rejects subtotal and unique-code totals that exceed storage", () => {
    expect(
      amountError(() => calculateOrderSubtotal(1_000_000_000, 3)).code,
    ).toBe("ORDER_AMOUNT_ABOVE_STORAGE_LIMIT");
    expect(
      amountError(() =>
        assertOrderTotalCapacity(POSTGRESQL_INT_MAX - 98, 99),
      ).code,
    ).toBe("ORDER_AMOUNT_ABOVE_STORAGE_LIMIT");
  });

  it("distinguishes malformed amounts from overflow", () => {
    expect(amountError(() => calculateOrderSubtotal(0, 598)).code).toBe(
      "ORDER_AMOUNT_INVALID",
    );
    expect(amountError(() => assertStoredOrderAmount(1.5)).code).toBe(
      "ORDER_AMOUNT_INVALID",
    );
    expect(amountError(() => maxOrderQuantityForUnitPrice(0)).code).toBe(
      "ORDER_AMOUNT_INVALID",
    );
  });
});
