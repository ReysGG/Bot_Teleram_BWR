export const DANA_ANDROID_PACKAGES = ["id.dana", "id.dana.kasir"] as const;
export const JAGO_ANDROID_PACKAGE = "com.jago.digitalBanking" as const;
export const SHOPEE_PARTNER_ANDROID_PACKAGE = "com.shopeepay.merchant.id" as const;
export const JAGO_TRANSFER_METHOD = "JAGO_TRANSFER" as const;

export type AndroidPaymentProvider = "DANA" | "JAGO" | "SHOPEE_PARTNER";

export function androidPaymentProviderForPackage(
  packageName: string,
): AndroidPaymentProvider | null {
  if (DANA_ANDROID_PACKAGES.some((candidate) => candidate === packageName)) {
    return "DANA";
  }
  if (packageName === JAGO_ANDROID_PACKAGE) return "JAGO";
  return packageName === SHOPEE_PARTNER_ANDROID_PACKAGE
    ? "SHOPEE_PARTNER"
    : null;
}
