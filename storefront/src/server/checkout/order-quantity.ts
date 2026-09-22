export const DEFAULT_MAX_ORDER_QUANTITY = 750;
export const HARD_MAX_ORDER_QUANTITY = 750;

const orderQuantityEnvName = "ORDER_MAX_QUANTITY";

export type OrderQuantityErrorCode =
  | "QUANTITY_NOT_INTEGER"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_GLOBAL_LIMIT"
  | "QUANTITY_ABOVE_PRODUCT_CAPACITY";

export class OrderQuantityError extends Error {
  constructor(
    public readonly code: OrderQuantityErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderQuantityError";
  }
}

function boundedNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function boundedMaximum(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ORDER_QUANTITY;
  return Math.min(
    Math.max(Math.floor(value), 1),
    HARD_MAX_ORDER_QUANTITY,
  );
}

function boundedCapacityMaximum(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_ORDER_QUANTITY;
  return Math.min(
    Math.max(Math.floor(value), 0),
    HARD_MAX_ORDER_QUANTITY,
  );
}

export function getMaxOrderQuantity(
  configuredValue = process.env[orderQuantityEnvName],
): number {
  const normalized = configuredValue?.trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    return DEFAULT_MAX_ORDER_QUANTITY;
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return DEFAULT_MAX_ORDER_QUANTITY;
  }

  return boundedMaximum(parsed);
}

export function normalizeOrderQuantity(
  value: number | undefined,
  maxQuantity = getMaxOrderQuantity(),
): number {
  const quantity = value ?? 1;
  if (!Number.isSafeInteger(quantity)) {
    throw new OrderQuantityError(
      "QUANTITY_NOT_INTEGER",
      "Jumlah order harus berupa angka bulat.",
    );
  }
  if (quantity < 1) {
    throw new OrderQuantityError(
      "QUANTITY_BELOW_MINIMUM",
      "Jumlah order minimal 1.",
    );
  }

  const maximum = boundedMaximum(maxQuantity);
  if (quantity > maximum) {
    throw new OrderQuantityError(
      "QUANTITY_ABOVE_GLOBAL_LIMIT",
      `Jumlah order melebihi batas maksimum ${maximum}.`,
    );
  }
  return quantity;
}

export type OrderQuantityCapacity = {
  maxQuantity: number;
  readyStock: number;
  preorderSlots: number | null;
};

export function resolveOrderQuantityCapacity(input: {
  readyStock: number;
  reservedStock: number;
  preorderEnabled: boolean;
  preorderLimit: number | null;
  activePreorders: number;
  configuredMaximum?: number;
}): OrderQuantityCapacity {
  const configuredMaximum = boundedCapacityMaximum(
    input.configuredMaximum ?? getMaxOrderQuantity(),
  );
  const readyStock = boundedNonNegativeInteger(input.readyStock);
  const reservedStock = boundedNonNegativeInteger(input.reservedStock);
  const activePreorders = boundedNonNegativeInteger(input.activePreorders);
  const preorderLimit =
    input.preorderLimit === null
      ? null
      : boundedNonNegativeInteger(input.preorderLimit);
  const preorderSlots = !input.preorderEnabled
    ? 0
    : preorderLimit === null
      ? null
      : Math.max(0, preorderLimit - activePreorders);

  // An active stock reservation means a larger request must wait instead of
  // bypassing the competing invoice through preorder.
  const preorderCapacity = reservedStock > 0
    ? 0
    : preorderSlots === null
      ? configuredMaximum
      : preorderSlots;

  return {
    maxQuantity: Math.min(
      configuredMaximum,
      Math.max(readyStock, preorderCapacity),
    ),
    readyStock,
    preorderSlots,
  };
}

export function assertOrderQuantityWithinCapacity(
  quantity: number,
  capacity: OrderQuantityCapacity,
): number {
  const normalized = normalizeOrderQuantity(quantity);
  if (normalized > capacity.maxQuantity) {
    throw new OrderQuantityError(
      "QUANTITY_ABOVE_PRODUCT_CAPACITY",
      capacity.maxQuantity > 0
        ? `Jumlah order melebihi kapasitas produk saat ini. Maksimal ${capacity.maxQuantity}.`
        : "Produk sedang tidak memiliki stok atau slot preorder yang tersedia.",
    );
  }
  return normalized;
}
