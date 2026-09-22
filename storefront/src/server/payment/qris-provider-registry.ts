import {
  DANA_ANDROID_PACKAGES,
  SHOPEE_PARTNER_ANDROID_PACKAGE,
} from "@/server/payment/android-payment-provider";

export const QRIS_PROVIDER_KEYS = ["DANA", "SHOPEE_PARTNER"] as const;

export type QrisProviderKey = (typeof QRIS_PROVIDER_KEYS)[number];

export type QrisProviderDefinition = Readonly<{
  key: QrisProviderKey;
  displayName: string;
  ready: boolean;
  usesDanaRelay: boolean;
  trustedPackageNames: readonly string[];
  notReadyReason: string | null;
}>;

const PROVIDERS: Record<QrisProviderKey, QrisProviderDefinition> = {
  DANA: {
    key: "DANA",
    displayName: "QRIS / DANA",
    ready: true,
    usesDanaRelay: true,
    trustedPackageNames: DANA_ANDROID_PACKAGES,
    notReadyReason: null,
  },
  SHOPEE_PARTNER: {
    key: "SHOPEE_PARTNER",
    displayName: "ShopeePay / Shopee Partner",
    ready: true,
    usesDanaRelay: false,
    trustedPackageNames: [SHOPEE_PARTNER_ANDROID_PACKAGE],
    notReadyReason: null,
  },
};

export function isQrisProviderKey(value: string): value is QrisProviderKey {
  return (QRIS_PROVIDER_KEYS as readonly string[]).includes(value);
}

export function getQrisProviderDefinition(
  providerKey: string,
): QrisProviderDefinition {
  if (!isQrisProviderKey(providerKey)) {
    throw new Error(`QRIS provider is not supported: ${providerKey}`);
  }
  return PROVIDERS[providerKey];
}

export function listQrisProviderDefinitions(): readonly QrisProviderDefinition[] {
  return QRIS_PROVIDER_KEYS.map((key) => PROVIDERS[key]);
}

export function qrisProviderUsesDanaRelay(providerKey: string): boolean {
  return getQrisProviderDefinition(providerKey).usesDanaRelay;
}
