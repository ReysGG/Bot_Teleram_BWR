import {
  SMSPOOL_CANCEL_PENDING_MESSAGE,
  SMSPOOL_NO_NUMBERS_MESSAGE,
  SMSPOOL_UNAVAILABLE_MESSAGE,
} from "@/server/smspool/client";

export type SmsPoolTelegramError = {
  kind: "NO_NUMBERS" | "MAINTENANCE" | "USER" | "GENERIC";
  message: string;
};

export function resolveSmsPoolTelegramError(message: string): SmsPoolTelegramError {
  if (message === SMSPOOL_NO_NUMBERS_MESSAGE) {
    return { kind: "NO_NUMBERS", message };
  }
  if (message === SMSPOOL_UNAVAILABLE_MESSAGE) {
    return { kind: "MAINTENANCE", message };
  }
  if (message === SMSPOOL_CANCEL_PENDING_MESSAGE) {
    return { kind: "USER", message };
  }
  if (
    message.startsWith("Saldo wallet") ||
    message.startsWith("Order SMS") ||
    message.startsWith("Pembayaran menggunakan saldo wallet")
  ) {
    return { kind: "USER", message };
  }
  return {
    kind: "GENERIC",
    message: "Permintaan SMS belum dapat diproses. Silakan pilih ulang aplikasi dan negara.",
  };
}
