import { qrisProviderUsesDanaRelay } from "@/server/payment/qris-provider-registry";
import { isPaymentEventWithinWindow } from "@/server/payment/window";
import { DANA_ANDROID_PACKAGES } from "@/server/payment/android-payment-provider";

export const QRIS_ORDER_PAYMENT_METHODS = ["DANA_RELAY", "WALLET_QRIS"] as const;

export function isQrisOrderPaymentMethod(method: string): boolean {
  return QRIS_ORDER_PAYMENT_METHODS.some((candidate) => candidate === method);
}

type QrisAttemptEvidence = {
  evidenceMode?: string;
  providerKeySnapshot: string;
  allowedPackageNamesSnapshot: readonly string[];
  allowedDeviceIdsSnapshot: readonly string[];
  amount: number;
  status: string;
  matchedEventId: string | null;
  expiresAt: Date;
} | null;

type QrisBridgeEventEvidence = {
  eventId: string;
  source: string;
  provider: string | null;
  claimId: string | null;
  deviceId: string | null;
  packageName: string | null;
  amount: number | null;
  postedAt: Date;
  status: string;
  orderId: string | null;
  walletTopupId: string | null;
};

export function qrisInvoiceEventBlockReason(input: {
  targetKind: "order" | "wallet_topup";
  targetId: string;
  billedAmount: number;
  createdAt: Date;
  expiresAt: Date;
  bridgeClaim: { claimId: string } | null;
  attempt: QrisAttemptEvidence;
  event: QrisBridgeEventEvidence;
  allowRejectedEvent?: boolean;
  allowTerminalAttempt?: boolean;
  allowShopeeAndroidFallback?: boolean;
}): string | null {
  if (
    input.event.status !== "RECEIVED" &&
    !(input.allowRejectedEvent && input.event.status === "REJECTED")
  ) {
    return "QRIS payment event is not available for confirmation";
  }
  if (
    (input.targetKind === "order" &&
      (input.event.walletTopupId ||
        (input.event.orderId && input.event.orderId !== input.targetId))) ||
    (input.targetKind === "wallet_topup" &&
      (input.event.orderId ||
        (input.event.walletTopupId && input.event.walletTopupId !== input.targetId)))
  ) {
    return "QRIS payment event is already linked to another target";
  }
  if (input.event.amount !== input.billedAmount) {
    return "QRIS payment event amount mismatch";
  }
  if (
    !isPaymentEventWithinWindow({
      postedAt: input.event.postedAt,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
    })
  ) {
    return "QRIS payment event is outside the invoice window";
  }

  const providerKey = input.attempt?.providerKeySnapshot ?? "DANA";
  if (input.attempt) {
    if (
      input.attempt.evidenceMode === "WEB_SESSION" &&
      !(input.allowShopeeAndroidFallback && providerKey === "SHOPEE_PARTNER")
    ) {
      return "QRIS invoice requires Shopee web-session evidence";
    }
    const allowedStatuses = input.allowTerminalAttempt
      ? ["AWAITING_PAYMENT", "MATCHED", "EXPIRED"]
      : ["AWAITING_PAYMENT"];
    if (
      !allowedStatuses.includes(input.attempt.status) ||
      input.attempt.matchedEventId ||
      input.attempt.amount !== input.billedAmount ||
      input.attempt.expiresAt.getTime() !== input.expiresAt.getTime()
    ) {
      return "QRIS invoice snapshot is not available for confirmation";
    }
  }

  if (input.event.source === "RELAY") {
    if (!qrisProviderUsesDanaRelay(providerKey)) {
      return "QRIS merchant does not use the DANA relay";
    }
    if (!input.bridgeClaim || input.event.claimId !== input.bridgeClaim.claimId) {
      return "QRIS relay claim mismatch";
    }
    return null;
  }

  if (
    input.event.source !== "ANDROID" ||
    input.event.provider !== providerKey ||
    !input.event.packageName
  ) {
    return "QRIS payment evidence provider mismatch";
  }
  const allowedPackageNames = input.attempt
    ? input.attempt.allowedPackageNamesSnapshot
    : DANA_ANDROID_PACKAGES;
  if (!allowedPackageNames.includes(input.event.packageName)) {
    return "QRIS payment evidence package mismatch";
  }
  if (
    input.attempt &&
    (!input.event.deviceId ||
      !input.attempt.allowedDeviceIdsSnapshot.includes(input.event.deviceId))
  ) {
    return "QRIS payment evidence device mismatch";
  }
  return null;
}
