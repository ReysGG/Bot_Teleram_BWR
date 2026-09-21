import { JAGO_ANDROID_PACKAGE } from "@/server/payment/android-payment-provider";
import { PAYMENT_EVENT_CLOCK_SKEW_MS } from "@/server/payment/window";

export type JagoTransferConfirmationEvidence = {
  bridgeEventId?: string;
  allowRejectedEvent?: boolean;
  payment: {
    billedAmount: number;
    createdAt: Date;
    expiresAt: Date;
  };
  attempt:
    | {
        status: string;
        matchedEventId: string | null;
        expiresAt: Date;
      }
    | null;
  event:
    | {
        eventId: string;
        source: string;
        provider: string | null;
        packageName: string | null;
        amount: number | null;
        postedAt: Date;
        status: string;
      }
    | null;
};

export function jagoTransferClosureStatus(
  reason: "cancel" | "expire",
): "CANCELLED" | "EXPIRED" {
  return reason === "cancel" ? "CANCELLED" : "EXPIRED";
}

export function jagoTransferConfirmationBlockReason(
  input: JagoTransferConfirmationEvidence,
): string | null {
  if (!input.attempt) return "Jago transfer attempt not found";
  if (!input.bridgeEventId || !input.event) {
    return "Jago transfer requires Android notification evidence";
  }
  if (input.event.eventId !== input.bridgeEventId) {
    return "Jago bridge event identity mismatch";
  }
  if (
    input.event.source !== "ANDROID" ||
    input.event.provider !== "JAGO" ||
    input.event.packageName !== JAGO_ANDROID_PACKAGE
  ) {
    return "Jago transfer requires a Bank Jago Android event";
  }
  if (
    input.event.status !== "RECEIVED" &&
    !(input.allowRejectedEvent && input.event.status === "REJECTED")
  ) {
    return "Jago bridge event is not available for confirmation";
  }
  if (input.event.amount !== input.payment.billedAmount) {
    return "Jago bridge event amount mismatch";
  }
  if (
    input.event.postedAt.getTime() <
      input.payment.createdAt.getTime() - PAYMENT_EVENT_CLOCK_SKEW_MS ||
    input.event.postedAt.getTime() >
      input.attempt.expiresAt.getTime() + PAYMENT_EVENT_CLOCK_SKEW_MS
  ) {
    return "Jago bridge event is outside the invoice window";
  }
  if (
    input.attempt.status !== "AWAITING_TRANSFER" ||
    input.attempt.matchedEventId !== null
  ) {
    return "Jago transfer attempt is not awaiting confirmation";
  }
  return null;
}
