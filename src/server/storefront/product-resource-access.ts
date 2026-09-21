const PRODUCT_RESOURCE_ORDER_STATUSES = new Set([
  "FULFILLING",
  "COMPLETED",
  "PAID_WAITING_STOCK",
]);

export function canAccessWebProductResources(input: {
  channel: string;
  paymentStatus: string;
  orderStatus: string;
}) {
  return input.channel === "WEB" &&
    input.paymentStatus === "PAID" &&
    PRODUCT_RESOURCE_ORDER_STATUSES.has(input.orderStatus);
}
