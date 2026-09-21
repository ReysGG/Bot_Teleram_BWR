import {
  externalIdrProviderForOrderPaymentMethod,
  type ExternalIdrPaymentProvider,
} from "@/server/payment/provider-methods";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";

export type AdminPaymentRecoveryAction =
  | { kind: "REVIEW_MANUAL_CRYPTO"; provider: "BINANCE" | "USDT_BEP20" }
  | { kind: "CONFIRM_ACTIVE"; provider: ExternalIdrPaymentProvider }
  | { kind: "CREDIT_EXPIRED_TO_WALLET"; provider: ExternalIdrPaymentProvider }
  | { kind: "RECHECK_PROVIDER"; provider: "BINANCE" | "USDT_BEP20" }
  | { kind: "RECONCILE_EVENT"; provider: ExternalIdrPaymentProvider }
  | {
      kind: "BLOCKED";
      reason:
        | "ALREADY_PAID"
        | "AWAITING_EXPIRY_WORKER"
        | "METHOD_NOT_MANUAL"
        | "STATE_NOT_ELIGIBLE";
    };

export function adminOrderPaymentRecoveryAction(input: {
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  expiresAt: Date;
  now: Date;
}): AdminPaymentRecoveryAction {
  if (
    input.orderPaymentStatus === "PAID" ||
    input.paymentStatus === "PAID"
  ) {
    return { kind: "BLOCKED", reason: "ALREADY_PAID" };
  }
  if (input.paymentMethod === "BINANCE_INTERNAL") {
    if (input.orderStatus === "PENDING_PAYMENT" && input.orderPaymentStatus === "PENDING" && input.paymentStatus === "PENDING" && input.expiresAt > input.now) {
      return { kind: "REVIEW_MANUAL_CRYPTO", provider: "BINANCE" };
    }
    return { kind: "RECHECK_PROVIDER", provider: "BINANCE" };
  }
  if (input.paymentMethod === "USDT_BEP20") {
    if (input.orderStatus === "PENDING_PAYMENT" && input.orderPaymentStatus === "PENDING" && input.paymentStatus === "PENDING" && input.expiresAt > input.now) {
      return { kind: "REVIEW_MANUAL_CRYPTO", provider: "USDT_BEP20" };
    }
    return { kind: "RECHECK_PROVIDER", provider: "USDT_BEP20" };
  }

  const provider = externalIdrProviderForOrderPaymentMethod(
    input.paymentMethod,
  );
  if (!provider) {
    return { kind: "BLOCKED", reason: "METHOD_NOT_MANUAL" };
  }
  if (
    input.orderStatus === "PENDING_PAYMENT" &&
    input.orderPaymentStatus === "PENDING" &&
    input.paymentStatus === "PENDING"
  ) {
    return input.expiresAt > input.now
      ? { kind: "CONFIRM_ACTIVE", provider }
      : { kind: "BLOCKED", reason: "AWAITING_EXPIRY_WORKER" };
  }
  if (
    input.orderStatus === "EXPIRED" &&
    input.orderPaymentStatus === "EXPIRED" &&
    input.paymentStatus === "EXPIRED" &&
    input.expiresAt <= input.now
  ) {
    return { kind: "CREDIT_EXPIRED_TO_WALLET", provider };
  }
  return { kind: "BLOCKED", reason: "STATE_NOT_ELIGIBLE" };
}

export function adminWalletTopupRecoveryAction(input: {
  status: string;
  paymentMethod: string;
  expiresAt: Date;
  now: Date;
}): AdminPaymentRecoveryAction {
  const provider: ExternalIdrPaymentProvider | null =
    input.paymentMethod === JAGO_TRANSFER_METHOD
      ? "JAGO"
      : input.paymentMethod === "DANA_RELAY"
        ? "DANA"
        : null;
  if (!provider) {
    return { kind: "BLOCKED", reason: "METHOD_NOT_MANUAL" };
  }
  if (input.status === "PAID") {
    return { kind: "BLOCKED", reason: "ALREADY_PAID" };
  }
  if (input.status === "PENDING") {
    return input.expiresAt > input.now
      ? { kind: "CONFIRM_ACTIVE", provider }
      : { kind: "BLOCKED", reason: "AWAITING_EXPIRY_WORKER" };
  }
  if (input.status === "EXPIRED") {
    return { kind: "RECONCILE_EVENT", provider };
  }
  return { kind: "BLOCKED", reason: "STATE_NOT_ELIGIBLE" };
}
