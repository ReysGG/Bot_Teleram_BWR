export type CheckoutAvailability =
  | "IN_STOCK"
  | "WAITING_CHECKOUT"
  | "PREORDER"
  | "OUT_OF_STOCK"
  | "PREORDER_FULL";

const checkoutAvailabilityPriority: Record<CheckoutAvailability, number> = {
  IN_STOCK: 0,
  PREORDER: 1,
  WAITING_CHECKOUT: 2,
  PREORDER_FULL: 3,
  OUT_OF_STOCK: 4,
};

export function compareCheckoutAvailability(
  left: CheckoutAvailability,
  right: CheckoutAvailability,
): number {
  return checkoutAvailabilityPriority[left] - checkoutAvailabilityPriority[right];
}

export function resolveCheckoutAvailability(input: {
  stockAvailable: boolean;
  preorderEnabled: boolean;
  preorderLimit: number | null;
  activePreorders: number;
  reservedUnits?: number;
  requestedUnits?: number;
}): CheckoutAvailability {
  if (input.stockAvailable) return "IN_STOCK";
  if ((input.reservedUnits ?? 0) > 0) return "WAITING_CHECKOUT";
  if (!input.preorderEnabled) return "OUT_OF_STOCK";
  const requestedUnits = input.requestedUnits ?? 1;
  if (
    input.preorderLimit !== null &&
    input.activePreorders + requestedUnits > input.preorderLimit
  ) {
    return "PREORDER_FULL";
  }
  return "PREORDER";
}

export function preorderSlotsRemaining(
  preorderLimit: number | null,
  activePreorders: number,
): number | null {
  if (preorderLimit === null) return null;
  return Math.max(0, preorderLimit - activePreorders);
}

export function paidOrderStatus(input: {
  isPreorder: boolean;
  hasReservedStock: boolean;
}): "FULFILLING" | "PAID_WAITING_STOCK" {
  if (input.hasReservedStock) return "FULFILLING";
  if (input.isPreorder) return "PAID_WAITING_STOCK";
  throw new Error("Paid order has no reserved stock");
}

export function orderStatusLabel(status: string, locale: "id" | "en" = "id"): string {
  const labels: Record<string, string> = locale === "en" ? {
    PENDING_PAYMENT: "Awaiting payment",
    PAID_WAITING_STOCK: "Paid - awaiting stock",
    FULFILLING: "Preparing files",
    COMPLETED: "Completed",
    EXPIRED: "Expired",
    CANCELLED: "Cancelled",
    REFUNDED: "Refunded to wallet",
    PAID: "Paid",
  } : {
    PENDING_PAYMENT: "Menunggu pembayaran",
    PAID_WAITING_STOCK: "Lunas - menunggu stok",
    FULFILLING: "Menyiapkan file",
    COMPLETED: "Selesai",
    EXPIRED: "Kedaluwarsa",
    CANCELLED: "Dibatalkan",
    REFUNDED: "Refund ke saldo",
    PAID: "Lunas",
  };
  return labels[status] ?? status;
}
