import type { SmsPoolCheck, SmsPoolOrder } from "@/server/smspool/client";

export type SmsPoolResolvedState =
  | { kind: "ACTIVE"; otpCode: null; fullCode: null }
  | { kind: "COMPLETED"; otpCode: string | null; fullCode: string | null }
  | { kind: "REFUNDED"; otpCode: null; fullCode: null };

function meaningfulProviderText(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized && !/^(?:0|-|null|undefined)$/i.test(normalized)
    ? normalized
    : null;
}

function otpFromFullMessage(message: string | null) {
  return message?.match(/\b\d{3,10}\b/)?.[0] ?? null;
}

export function hasSmsPoolMessage(input: { otpCode?: string | null; fullCode?: string | null }) {
  return Boolean(
    meaningfulProviderText(input.otpCode) || meaningfulProviderText(input.fullCode),
  );
}

export function resolveSmsPoolOrderState(
  order: Pick<SmsPoolOrder, "code" | "full_code" | "status">,
): SmsPoolResolvedState {
  const code = meaningfulProviderText(order.code);
  const fullCode = meaningfulProviderText(order.full_code);
  if (code || fullCode) {
    return {
      kind: "COMPLETED",
      otpCode: code ?? otpFromFullMessage(fullCode),
      fullCode,
    };
  }
  if (/(?:refund|cancel)/i.test(order.status)) {
    return { kind: "REFUNDED", otpCode: null, fullCode: null };
  }
  return { kind: "ACTIVE", otpCode: null, fullCode: null };
}

export function resolveSmsPoolCheckState(
  check: Pick<SmsPoolCheck, "status" | "sms" | "full_sms">,
): SmsPoolResolvedState {
  if (check.status === 6) {
    return { kind: "REFUNDED", otpCode: null, fullCode: null };
  }
  const code = meaningfulProviderText(check.sms);
  const fullCode = meaningfulProviderText(check.full_sms);
  if (check.status === 3 && (code || fullCode)) {
    return {
      kind: "COMPLETED",
      otpCode: code ?? otpFromFullMessage(fullCode),
      fullCode,
    };
  }
  return { kind: "ACTIVE", otpCode: null, fullCode: null };
}
