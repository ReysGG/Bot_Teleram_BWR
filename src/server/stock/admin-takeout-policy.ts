export function canTakeUnsoldStock(item: {
  status: string;
  healthStatus: string;
  reservedOrderId: string | null;
  deliveredOrderId: string | null;
  orderItem: unknown;
  deliveryReceipt: unknown;
}): boolean {
  return ["AVAILABLE", "BANNED", "DISABLED"].includes(item.status)
    && (item.status === "BANNED" || item.healthStatus === "BANNED")
    && !item.reservedOrderId && !item.deliveredOrderId
    && !item.orderItem && !item.deliveryReceipt;
}
