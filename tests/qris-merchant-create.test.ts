import { beforeEach, describe, expect, it, vi } from "vitest";
import { qrisCrc16 } from "@/server/payment/qris";

const mocks = vi.hoisted(() => {
  const publicRow = (data: Record<string, unknown>) => ({
    id: "merchant-new",
    slug: data.slug,
    name: data.name,
    providerKey: data.providerKey,
    enabled: data.enabled,
    isActive: data.isActive ?? false,
    activatedAt: data.activatedAt ?? null,
    activatedBy: data.activatedBy ?? null,
    archivedAt: null,
    archivedBy: null,
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
    createdAt: new Date("2026-08-23T12:00:00.000Z"),
    updatedAt: new Date("2026-08-23T12:00:00.000Z"),
    payloadFingerprint: data.payloadFingerprint,
    trustedDeviceId: data.trustedDeviceId ?? null,
    shopeeAccountFingerprint: data.shopeeAccountFingerprint ?? null,
  });
  const calls: string[] = [];
  const bridgeDevice = { current: null as null | Record<string, unknown> };
  const shopeeSession = { current: null as null | Record<string, unknown> };
  const tx = {
    $executeRaw: vi.fn(async () => {
      calls.push("lock");
      return 1;
    }),
    qrisMerchant: {
      updateMany: vi.fn(async () => {
        calls.push("deactivate");
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push("create");
        return publicRow(data);
      }),
    },
    bridgeDeviceStatus: {
      findFirst: vi.fn(async () => bridgeDevice.current),
    },
    shopeePartnerSession: {
      findFirst: vi.fn(async () => shopeeSession.current),
    },
    storeRuntimeSetting: {
      upsert: vi.fn(async () => {
        calls.push("legacy-off");
        return { id: "global" };
      }),
    },
  };
  return {
    calls,
    bridgeDevice,
    shopeeSession,
    tx,
    rootCreate: vi.fn(async ({ data }: { data: Record<string, unknown> }) => publicRow(data)),
    rootSessionFind: vi.fn(async () => shopeeSession.current),
    transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  };
});

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    qrisMerchant: { create: mocks.rootCreate },
    shopeePartnerSession: { findFirst: mocks.rootSessionFind },
    $transaction: mocks.transaction,
  },
}));

import { createQrisMerchant } from "@/server/payment/qris-merchant-service";

function staticPayload(): string {
  const body = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

describe("QRIS merchant create-and-activate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.calls.length = 0;
    mocks.bridgeDevice.current = null;
    mocks.shopeeSession.current = null;
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  });

  it("keeps the existing create-only behavior when activation is not requested", async () => {
    const merchant = await createQrisMerchant({
      slug: "qris-draft",
      name: "QRIS Draft",
      providerKey: "DANA",
      basePayload: staticPayload(),
      enabled: false,
      actor: "admin:owner@example.test",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.rootCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ enabled: false }),
    }));
    expect(merchant.isActive).toBe(false);
  });

  it("locks, deactivates the previous merchant, and creates the replacement active atomically", async () => {
    const merchant = await createQrisMerchant({
      slug: "qris-replacement",
      name: "QRIS Replacement",
      providerKey: "DANA",
      basePayload: staticPayload(),
      enabled: false,
      activateAfterSave: true,
      actor: "admin:owner@example.test",
    });

    expect(mocks.rootCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.calls).toEqual(["lock", "deactivate", "legacy-off", "create"]);
    expect(mocks.tx.qrisMerchant.updateMany).toHaveBeenCalledWith({
      where: { isActive: true },
      data: {
        isActive: false,
        activatedAt: null,
        activatedBy: null,
        updatedBy: "admin:owner@example.test",
      },
    });
    expect(mocks.tx.qrisMerchant.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        enabled: true,
        isActive: true,
        activatedAt: expect.any(Date),
        activatedBy: "admin:owner@example.test",
      }),
    }));
    expect(merchant.enabled).toBe(true);
    expect(merchant.isActive).toBe(true);
  });

  it("allows a Shopee merchant draft without trusting an unregistered Device ID", async () => {
    const merchant = await createQrisMerchant({
      slug: "shopee-draft",
      name: "Shopee Draft",
      providerKey: "SHOPEE_PARTNER",
      basePayload: staticPayload(),
      enabled: true,
      trustedDeviceId: "device-primary-123",
      actor: "admin:owner@example.test",
    });

    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.tx.bridgeDeviceStatus.findFirst).not.toHaveBeenCalled();
    expect(merchant.isActive).toBe(false);
  });

  it("rejects create-and-activate when the Shopee Device ID has no heartbeat record", async () => {
    await expect(createQrisMerchant({
      slug: "shopee-active",
      name: "Shopee Active",
      providerKey: "SHOPEE_PARTNER",
      basePayload: staticPayload(),
      activateAfterSave: true,
      trustedDeviceId: "device-primary-123",
      actor: "admin:owner@example.test",
    })).rejects.toMatchObject({ code: "SHOPEE_DEVICE_NOT_REGISTERED" });

    expect(mocks.tx.qrisMerchant.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.qrisMerchant.create).not.toHaveBeenCalled();
  });

  it("accepts create-and-activate only after the Shopee bridge reports versionCode 20", async () => {
    mocks.bridgeDevice.current = {
      deviceId: "device-primary-123",
      lastSeenAt: new Date("2026-08-23T12:00:00.000Z"),
      listenerConnected: true,
      appVersion: "1.5.7",
      appVersionCode: 20,
    };

    const merchant = await createQrisMerchant({
      slug: "shopee-active",
      name: "Shopee Active",
      providerKey: "SHOPEE_PARTNER",
      basePayload: staticPayload(),
      activateAfterSave: true,
      trustedDeviceId: "device-primary-123",
      actor: "admin:owner@example.test",
    });

    expect(mocks.tx.bridgeDeviceStatus.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { deviceId: "device-primary-123", source: "ANDROID" },
    }));
    expect(merchant.isActive).toBe(true);
  });

  it("stores only the validated Shopee account fingerprint selected by session ID", async () => {
    mocks.shopeeSession.current = {
      merchantAccountFingerprint: "a".repeat(64),
    };

    const merchant = await createQrisMerchant({
      slug: "shopee-bound",
      name: "Shopee Bound",
      providerKey: "SHOPEE_PARTNER",
      basePayload: staticPayload(),
      trustedDeviceId: "device-primary-123",
      shopeeSessionId: "session-validated-1",
      actor: "admin:owner@example.test",
    });

    expect(mocks.rootSessionFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "session-validated-1", status: "ACTIVE" }),
    }));
    expect(mocks.rootCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        shopeeAccountFingerprint: "a".repeat(64),
      }),
    }));
    expect(merchant.shopeeAccountFingerprint).toBe("a".repeat(64));
  });
});
