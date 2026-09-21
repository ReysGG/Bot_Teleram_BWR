import type { AndroidPaymentProvider } from "@/server/payment/android-payment-provider";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import { DANA_BRIDGE_ORDER_PAYMENT_METHODS } from "@/server/payment/dana-payment-method";

export type ExternalIdrPaymentProvider = AndroidPaymentProvider;

export const DANA_WALLET_TOPUP_METHOD = "DANA_RELAY" as const;

function assertNeverProvider(provider: never): never {
  throw new Error(`Unsupported Android payment provider: ${provider}`);
}

export function orderPaymentMethodsForProvider(
  provider: ExternalIdrPaymentProvider,
): readonly string[] {
  switch (provider) {
    case "DANA":
    case "SHOPEE_PARTNER":
      return DANA_BRIDGE_ORDER_PAYMENT_METHODS;
    case "JAGO":
      return [JAGO_TRANSFER_METHOD];
    default:
      return assertNeverProvider(provider);
  }
}

export function orderPaymentMethodMatchesProvider(
  provider: ExternalIdrPaymentProvider,
  method: string,
): boolean {
  return orderPaymentMethodsForProvider(provider).some(
    (candidate) => candidate === method,
  );
}

export function walletTopupPaymentMethodForProvider(
  provider: ExternalIdrPaymentProvider,
): string {
  switch (provider) {
    case "DANA":
    case "SHOPEE_PARTNER":
      return DANA_WALLET_TOPUP_METHOD;
    case "JAGO":
      return JAGO_TRANSFER_METHOD;
    default:
      return assertNeverProvider(provider);
  }
}

export function externalIdrProviderForOrderPaymentMethod(
  method: string,
): ExternalIdrPaymentProvider | null {
  if (method === JAGO_TRANSFER_METHOD) return "JAGO";
  return DANA_BRIDGE_ORDER_PAYMENT_METHODS.some(
    (candidate) => candidate === method,
  )
    ? "DANA"
    : null;
}

export function externalIdrProviderLabel(
  provider: ExternalIdrPaymentProvider,
): string {
  switch (provider) {
    case "DANA":
      return "QRIS / DANA";
    case "SHOPEE_PARTNER":
      return "Shopee Partner QRIS";
    case "JAGO":
      return "Bank Jago";
    default:
      return assertNeverProvider(provider);
  }
}
