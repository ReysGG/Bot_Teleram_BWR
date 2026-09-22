export const POSTGRESQL_INT_MAX = 2_147_483_647;

export type OrderAmountErrorCode =
  | "ORDER_AMOUNT_INVALID"
  | "ORDER_AMOUNT_ABOVE_STORAGE_LIMIT";

export class OrderAmountError extends Error {
  constructor(
    public readonly code: OrderAmountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderAmountError";
  }
}

export function assertStoredOrderAmount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new OrderAmountError(
      "ORDER_AMOUNT_INVALID",
      "Nominal order tidak valid.",
    );
  }
  if (value > POSTGRESQL_INT_MAX) {
    throw new OrderAmountError(
      "ORDER_AMOUNT_ABOVE_STORAGE_LIMIT",
      "Total order melebihi batas nominal yang dapat diproses. Kurangi jumlah pembelian.",
    );
  }
  return value;
}

export function calculateOrderSubtotal(
  unitPrice: number,
  quantity: number,
): number {
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice <= 0 ||
    !Number.isSafeInteger(quantity) ||
    quantity <= 0
  ) {
    throw new OrderAmountError(
      "ORDER_AMOUNT_INVALID",
      "Nominal order tidak valid.",
    );
  }
  return assertStoredOrderAmount(unitPrice * quantity);
}

export function maxOrderQuantityForUnitPrice(
  unitPrice: number,
  maximumAdditionalAmount = 99,
): number {
  if (
    !Number.isSafeInteger(unitPrice) ||
    unitPrice <= 0 ||
    !Number.isSafeInteger(maximumAdditionalAmount) ||
    maximumAdditionalAmount < 0 ||
    maximumAdditionalAmount > POSTGRESQL_INT_MAX
  ) {
    throw new OrderAmountError(
      "ORDER_AMOUNT_INVALID",
      "Nominal order tidak valid.",
    );
  }
  return Math.floor(
    (POSTGRESQL_INT_MAX - maximumAdditionalAmount) / unitPrice,
  );
}

export function assertOrderTotalCapacity(
  subtotal: number,
  maximumAdditionalAmount: number,
): void {
  assertStoredOrderAmount(subtotal);
  if (
    !Number.isSafeInteger(maximumAdditionalAmount) ||
    maximumAdditionalAmount < 0
  ) {
    throw new OrderAmountError(
      "ORDER_AMOUNT_INVALID",
      "Nominal order tidak valid.",
    );
  }
  assertStoredOrderAmount(subtotal + maximumAdditionalAmount);
}
