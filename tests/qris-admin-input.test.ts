import { describe, expect, it } from "vitest";
import {
  isShopeePartnerQrisPayload,
  preserveQrisPayload,
} from "@/components/admin/qris-payload-preservation";
import {
  bridgeSupportsShopeePartner,
  toAdminBridgeDeviceOption,
} from "@/server/payment/bridge-device-options";
import {
  normalizeAndValidateStaticQrisPayload,
  qrisCrc16,
} from "@/server/payment/qris";
import { qrisMerchantActivationReadiness } from "@/server/payment/qris-merchant-activation-policy";
import { getQrisProviderDefinition } from "@/server/payment/qris-provider-registry";

function shopeePayloadWithSpaces() {
  const body = "00020101021126200016ID.CO.SHOPEE.WWW5204000053033605802ID5908BWR REYS6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

describe("QRIS admin input", () => {
  it("preserves whitespace inside TLV values while trimming transport whitespace", () => {
    const payload = shopeePayloadWithSpaces();
    const preserved = preserveQrisPayload(`\r\n${payload}\n`);

    expect(preserved).toBe(payload);
    expect(preserved).toContain("BWR REYS");
    expect(normalizeAndValidateStaticQrisPayload(preserved)).toBe(payload);
  });

  it("detects only the exact Shopee merchant account identifier", () => {
    expect(isShopeePartnerQrisPayload(shopeePayloadWithSpaces())).toBe(true);
    expect(isShopeePartnerQrisPayload("0015ID.CO.SHOPEE.WWW")).toBe(false);
    expect(isShopeePartnerQrisPayload("0016ID.CO.SHOPEE.APP")).toBe(false);
  });

  it("marks bridge versions before 1.5.7 as incompatible with Shopee Partner", () => {
    expect(bridgeSupportsShopeePartner({ appVersion: "1.5.6", appVersionCode: null })).toBe(false);
    expect(bridgeSupportsShopeePartner({ appVersion: "1.5.7", appVersionCode: null })).toBe(true);
    expect(bridgeSupportsShopeePartner({ appVersion: "9.0.0", appVersionCode: 19 })).toBe(false);
    expect(bridgeSupportsShopeePartner({ appVersion: null, appVersionCode: null })).toBeNull();
  });

  it("maps heartbeat diagnostics without changing the device identifier", () => {
    const option = toAdminBridgeDeviceOption({
      deviceId: "device-primary-123456",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    }, new Date("2026-08-23T12:09:00.000Z"));

    expect(option.deviceId).toBe("device-primary-123456");
    expect(option.isFresh).toBe(true);
    expect(option.listenerConnected).toBe(true);
    expect(option.supportsShopeePartner).toBe(true);
  });

  it("uses the same Shopee bridge readiness policy for selector and backend", () => {
    const provider = getQrisProviderDefinition("SHOPEE_PARTNER");
    const deviceId = "device-primary-123456";
    const baseDevice = {
      deviceId,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
      isFresh: true,
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    } as const;

    expect(qrisMerchantActivationReadiness(provider, deviceId, [])).toMatchObject({
      canActivate: false,
      code: "SHOPEE_DEVICE_NOT_REGISTERED",
    });
    expect(qrisMerchantActivationReadiness(provider, deviceId, [{
      ...baseDevice,
      appVersion: null,
      appVersionCode: null,
      supportsShopeePartner: null,
    }])).toMatchObject({
      canActivate: false,
      code: "SHOPEE_BRIDGE_VERSION_UNKNOWN",
    });
    expect(qrisMerchantActivationReadiness(provider, deviceId, [{
      ...baseDevice,
      appVersion: "1.5.6",
      appVersionCode: 19,
      supportsShopeePartner: false,
    }])).toMatchObject({
      canActivate: false,
      code: "SHOPEE_BRIDGE_UNSUPPORTED",
    });
    expect(qrisMerchantActivationReadiness(provider, deviceId, [{
      ...baseDevice,
      supportsShopeePartner: true,
    }])).toEqual({ canActivate: true, code: null, reason: null });
  });
});
