import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptSecret } from "@/server/security/crypto";
import { qrisCrc16 } from "@/server/payment/qris";

const mocks = vi.hoisted(() => {
  const bridgeDevice = { current: null as null | Record<string, unknown> };
  const merchant = { current: null as null | Record<string, unknown> };
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    bridgeDeviceStatus: {
      findFirst: vi.fn(async () => bridgeDevice.current),
    },
    shopeePartnerSession: {
      findFirst: vi.fn(async () => ({
        merchantAccountFingerprint: "b".repeat(64),
      })),
    },
    qrisMerchant: {
      findUnique: vi.fn(async () => merchant.current),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        ...merchant.current,
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    storeRuntimeSetting: {
      upsert: vi.fn(async () => ({ id: "global" })),
    },
  };
  return {
    bridgeDevice,
    merchant,
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

import {
  activateQrisMerchant,
  updateQrisMerchant,
} from "@/server/payment/qris-merchant-service";

function staticPayload(): string {
  const body = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

function activeShopeeMerchant() {
  const encrypted = encryptSecret(staticPayload());
  return {
    id: "merchant-shopee",
    slug: "shopee-main",
    name: "Shopee Main",
    providerKey: "SHOPEE_PARTNER",
    enabled: true,
    isActive: true,
    activatedAt: new Date("2026-08-23T12:00:00.000Z"),
    activatedBy: "admin:owner@example.test",
    archivedAt: null,
    archivedBy: null,
    createdBy: "admin:owner@example.test",
    updatedBy: "admin:owner@example.test",
    createdAt: new Date("2026-08-23T12:00:00.000Z"),
    updatedAt: new Date("2026-08-23T12:00:00.000Z"),
    payloadFingerprint: "fingerprint",
    trustedDeviceId: "device-primary-123",
    shopeeAccountFingerprint: "a".repeat(64),
    encryptedBasePayload: encrypted.encryptedPayload,
    basePayloadEncryptionIv: encrypted.encryptionIv,
    basePayloadEncryptionTag: encrypted.encryptionTag,
  };
}

describe("Shopee QRIS activation guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    mocks.bridgeDevice.current = null;
    mocks.merchant.current = activeShopeeMerchant();
  });

  it("rejects editing an active Shopee merchant when its Device ID is not registered", async () => {
    await expect(updateQrisMerchant({
      id: "merchant-shopee",
      name: "Shopee Main Updated",
      actor: "admin:owner@example.test",
    })).rejects.toMatchObject({ code: "SHOPEE_DEVICE_NOT_REGISTERED" });

    expect(mocks.tx.qrisMerchant.update).not.toHaveBeenCalled();
  });

  it("rejects activating an existing Shopee merchant on an outdated bridge", async () => {
    mocks.merchant.current = { ...activeShopeeMerchant(), isActive: false };
    mocks.bridgeDevice.current = {
      deviceId: "device-primary-123",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.6",
      appVersionCode: 19,
    };

    await expect(activateQrisMerchant({
      id: "merchant-shopee",
      actor: "admin:owner@example.test",
    })).rejects.toMatchObject({ code: "SHOPEE_BRIDGE_UNSUPPORTED" });

    expect(mocks.tx.qrisMerchant.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.qrisMerchant.update).not.toHaveBeenCalled();
  });

  it("allows activating the existing merchant after the bridge reports versionCode 20", async () => {
    mocks.merchant.current = { ...activeShopeeMerchant(), isActive: false };
    mocks.bridgeDevice.current = {
      deviceId: "device-primary-123",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    };

    const result = await activateQrisMerchant({
      id: "merchant-shopee",
      actor: "admin:owner@example.test",
    });

    expect(result.isActive).toBe(true);
    expect(mocks.tx.qrisMerchant.update).toHaveBeenCalled();
  });

  it("preserves the account binding when an edit does not select a new session", async () => {
    mocks.bridgeDevice.current = {
      deviceId: "device-primary-123",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    };

    await updateQrisMerchant({
      id: "merchant-shopee",
      name: "Shopee Main Updated",
      actor: "admin:owner@example.test",
    });

    expect(mocks.tx.qrisMerchant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shopeeAccountFingerprint: "a".repeat(64) }),
    }));
  });

  it("resolves a newly selected session on the server instead of trusting a fingerprint input", async () => {
    mocks.merchant.current = { ...activeShopeeMerchant(), isActive: false };
    mocks.bridgeDevice.current = {
      deviceId: "device-primary-123",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    };

    await updateQrisMerchant({
      id: "merchant-shopee",
      shopeeSessionId: "session-2",
      actor: "admin:owner@example.test",
    });

    expect(mocks.tx.shopeePartnerSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "session-2", status: "ACTIVE" }),
    }));
    expect(mocks.tx.qrisMerchant.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ shopeeAccountFingerprint: "b".repeat(64) }),
    }));
  });
});
