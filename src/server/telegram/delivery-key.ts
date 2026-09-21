export const PAYMENT_SUCCESS_PRIORITY = 1;
export const DIGITAL_DELIVERY_PRIORITY = 2;
export const PRODUCT_RESTOCK_PRIORITY = 26;
export const PRODUCT_SOLD_OUT_PRIORITY = 27;

export function digitalDeliveryDedupeKey(orderId: string, stockItemId: string) {
  return `delivery:${orderId}:${stockItemId}`;
}

export function paymentSuccessDedupeKey(orderId: string) {
  return `payment-success:${orderId}`;
}

export function productAnnouncementDedupeKey(productId: string, chatId: string) {
  return `product-announcement:${productId}:${chatId}`;
}

export function productRestockDedupeKey(batchId: string, chatId: string) {
  return `product-restock:${batchId}:${chatId}`;
}

export function productSoldOutDedupeKey(orderId: string, chatId: string) {
  return `product-sold-out:${orderId}:${chatId}`;
}

export function walletTopupSuccessDedupeKey(walletTopupId: string) {
  return `wallet-topup-success:${walletTopupId}`;
}

export function walletRefundDedupeKey(orderId: string) {
  return `wallet-refund:${orderId}`;
}

export function preorderCancellationDedupeKey(orderId: string) {
  return `preorder-cancelled:${orderId}`;
}

export function adminBroadcastDedupeKey(broadcastId: string, chatId: string) {
  return `admin-broadcast:${broadcastId}:${chatId}`;
}

export function reengagementDedupeKey(
  chatId: string,
  lastInboundAt: Date,
  sequence: number,
) {
  return `reengagement:${chatId}:${lastInboundAt.getTime()}:${sequence}`;
}
