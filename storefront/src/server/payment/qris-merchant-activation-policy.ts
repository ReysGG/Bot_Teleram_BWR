import type { AdminBridgeDeviceOption } from "@/server/payment/bridge-device-options";

type QrisActivationProvider = {
  key: string;
  ready: boolean;
  usesDanaRelay: boolean;
  trustedPackageNames: readonly string[];
  notReadyReason: string | null;
};

export type QrisMerchantActivationErrorCode =
  | "PROVIDER_NOT_READY"
  | "PROVIDER_PACKAGE_UNKNOWN"
  | "TRUSTED_DEVICE_REQUIRED"
  | "SHOPEE_DEVICE_NOT_REGISTERED"
  | "SHOPEE_BRIDGE_VERSION_UNKNOWN"
  | "SHOPEE_BRIDGE_UNSUPPORTED";

export type QrisMerchantActivationReadiness =
  | { canActivate: true; code: null; reason: null }
  | {
      canActivate: false;
      code: QrisMerchantActivationErrorCode;
      reason: string;
    };

export function qrisMerchantActivationReadiness(
  provider: QrisActivationProvider,
  trustedDeviceId: string | null,
  bridgeDevices: readonly AdminBridgeDeviceOption[],
): QrisMerchantActivationReadiness {
  if (!provider.ready) {
    return {
      canActivate: false,
      code: "PROVIDER_NOT_READY",
      reason: provider.notReadyReason ?? "Provider QRIS belum siap digunakan.",
    };
  }
  if (provider.trustedPackageNames.length === 0) {
    return {
      canActivate: false,
      code: "PROVIDER_PACKAGE_UNKNOWN",
      reason: "Package Android provider belum diverifikasi.",
    };
  }
  if (!provider.usesDanaRelay && !trustedDeviceId) {
    return {
      canActivate: false,
      code: "TRUSTED_DEVICE_REQUIRED",
      reason: "Provider QRIS ini memerlukan Device ID Android merchant yang sudah diverifikasi.",
    };
  }
  if (provider.key !== "SHOPEE_PARTNER") {
    return { canActivate: true, code: null, reason: null };
  }

  const bridgeDevice = bridgeDevices.find((device) => device.deviceId === trustedDeviceId);
  if (!bridgeDevice) {
    return {
      canActivate: false,
      code: "SHOPEE_DEVICE_NOT_REGISTERED",
      reason: "Device ID ShopeePay belum terdaftar melalui heartbeat aplikasi bridge.",
    };
  }
  if (bridgeDevice.supportsShopeePartner === null) {
    return {
      canActivate: false,
      code: "SHOPEE_BRIDGE_VERSION_UNKNOWN",
      reason: "Versi aplikasi bridge pada perangkat ShopeePay belum dilaporkan.",
    };
  }
  if (!bridgeDevice.supportsShopeePartner) {
    return {
      canActivate: false,
      code: "SHOPEE_BRIDGE_UNSUPPORTED",
      reason: "Aplikasi bridge pada perangkat ShopeePay harus diperbarui ke versi 1.5.7 (versionCode 20) atau lebih baru.",
    };
  }
  return { canActivate: true, code: null, reason: null };
}
