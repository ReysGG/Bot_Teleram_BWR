export const DANA_BRIDGE_ORDER_PAYMENT_METHODS = [
  "DANA_RELAY",
  "WALLET_QRIS",
] as const;

export function isDanaBridgeOrderPaymentMethod(method: string): boolean {
  return DANA_BRIDGE_ORDER_PAYMENT_METHODS.some((candidate) => candidate === method);
}
