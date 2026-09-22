import { qrisMerchantErrorCode } from "@/server/payment/qris-merchant-service";
import { legacyQrisErrorCode } from "@/server/payment/qris-legacy-service";

export function qrisAdminErrorCode(error: unknown): string {
  const legacyCode = legacyQrisErrorCode(error);
  if (legacyCode) return legacyCode.toLowerCase();
  const domainCode = qrisMerchantErrorCode(error);
  if (domainCode) return domainCode.toLowerCase();
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return "duplicate_slug";
  }
  return "action_failed";
}

export function qrisAdminReturnPath(
  merchantId: string,
  value: FormDataEntryValue | null,
): string {
  const detailPath = `/admin/payment-settings/qris/${encodeURIComponent(merchantId)}`;
  return value === "/admin/payment-settings/qris" ? value : detailPath;
}
