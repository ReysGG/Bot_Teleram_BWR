import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertQrisEvidenceIdempotency,
  buildDynamicQrisPayloadForAttempt,
  createQrisInvoiceAttempt,
} from "@/server/payment/qris-merchant-service";
import {
  getQrisProviderDefinition,
  listQrisProviderDefinitions,
  qrisProviderUsesDanaRelay,
} from "@/server/payment/qris-provider-registry";
import { parseQrisFields, qrisCrc16 } from "@/server/payment/qris";
import { renderQrisInvoice } from "@/server/payment/qris-invoice";
import { SHOPEE_PARTNER_ANDROID_PACKAGE } from "@/server/payment/android-payment-provider";
import { encryptSecret } from "@/server/security/crypto";

const originalEncryptionKey = process.env.DIGITAL_STOCK_ENCRYPTION_KEY;
const originalLegacyPayload = process.env.PAYMENT_QRIS_BASE_PAYLOAD;
const originalLegacyDeviceIds = process.env.DANA_ANDROID_BRIDGE_DEVICE_IDS;
const originalShopeeCheckoutEnabled = process.env.SHOPEE_WEB_SESSION_CHECKOUT_ENABLED;

function staticPayload(): string {
  const body = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

afterEach(() => {
  if (originalEncryptionKey === undefined) {
    delete process.env.DIGITAL_STOCK_ENCRYPTION_KEY;
  } else {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = originalEncryptionKey;
  }
  if (originalLegacyPayload === undefined) {
    delete process.env.PAYMENT_QRIS_BASE_PAYLOAD;
  } else {
    process.env.PAYMENT_QRIS_BASE_PAYLOAD = originalLegacyPayload;
  }
  if (originalLegacyDeviceIds === undefined) {
    delete process.env.DANA_ANDROID_BRIDGE_DEVICE_IDS;
  } else {
    process.env.DANA_ANDROID_BRIDGE_DEVICE_IDS = originalLegacyDeviceIds;
  }
  if (originalShopeeCheckoutEnabled === undefined) {
    delete process.env.SHOPEE_WEB_SESSION_CHECKOUT_ENABLED;
  } else {
    process.env.SHOPEE_WEB_SESSION_CHECKOUT_ENABLED = originalShopeeCheckoutEnabled;
  }
});

describe("QRIS provider registry", () => {
  it("keeps DANA and Shopee Partner ready with separate transport rules", () => {
    const dana = getQrisProviderDefinition("DANA");
    const shopee = getQrisProviderDefinition("SHOPEE_PARTNER");

    expect(dana.ready).toBe(true);
    expect(qrisProviderUsesDanaRelay("DANA")).toBe(true);
    expect(dana.trustedPackageNames).toEqual(["id.dana", "id.dana.kasir"]);
    expect(shopee.ready).toBe(true);
    expect(qrisProviderUsesDanaRelay("SHOPEE_PARTNER")).toBe(false);
    expect(shopee.trustedPackageNames).toEqual([
      SHOPEE_PARTNER_ANDROID_PACKAGE,
    ]);
    expect(shopee.notReadyReason).toBeNull();
    expect(listQrisProviderDefinitions()).toHaveLength(2);
  });
});

describe("QRIS invoice snapshots", () => {
  it("guards evidence mode and session identity on both idempotent lookup paths", () => {
    const attempt = {
      evidenceMode: "WEB_SESSION",
      shopeeSessionIdSnapshot: "session-1",
    };

    expect(() => assertQrisEvidenceIdempotency({
      attempt,
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: " session-1 ",
    })).not.toThrow();
    expect(() => assertQrisEvidenceIdempotency({
      attempt,
      evidenceMode: "ANDROID_NOTIFICATION",
    })).toThrow("bukti QRIS berbeda");
    expect(() => assertQrisEvidenceIdempotency({
      attempt,
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: "session-2",
    })).toThrow("bukti QRIS berbeda");
    expect(() => assertQrisEvidenceIdempotency({ attempt })).not.toThrow();
  });

  it("preserves the legacy env fallback as an encrypted DANA snapshot", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PAYMENT_QRIS_BASE_PAYLOAD = staticPayload();
    process.env.DANA_ANDROID_BRIDGE_DEVICE_IDS = "device-primary-123, device-backup-456,device-primary-123";
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "attempt-1",
      ...data,
    }));
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      storeRuntimeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      qrisInvoiceAttempt: { create },
    } as never;

    await createQrisInvoiceAttempt(
      {
        orderId: "order-1",
        amount: 3_055,
        expiresAt: new Date(Date.now() + 60_000),
      },
      client,
    );

    const data = create.mock.calls[0]?.[0].data;
    expect(data?.providerKeySnapshot).toBe("DANA");
    expect(data?.allowedPackageNamesSnapshot).toEqual([
      "id.dana",
      "id.dana.kasir",
    ]);
    expect(data?.allowedDeviceIdsSnapshot).toEqual([
      "device-primary-123",
      "device-backup-456",
    ]);
    expect(data?.encryptedBasePayloadSnapshot).not.toBe(staticPayload());

    const dynamic = buildDynamicQrisPayloadForAttempt(data as never);
    expect(parseQrisFields(dynamic).find((field) => field.tag === "54")?.value).toBe(
      "3055",
    );
    const rendered = await renderQrisInvoice({
      amount: 3_055,
      attempt: data as never,
    });
    expect(rendered.legacy).toBe(false);
    expect(rendered.png.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  it("does not reactivate the legacy env fallback after admin disables it", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PAYMENT_QRIS_BASE_PAYLOAD = staticPayload();
    const create = vi.fn();
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      storeRuntimeSetting: {
        findUnique: vi.fn().mockResolvedValue({ legacyQrisFallbackEnabled: false }),
      },
      qrisInvoiceAttempt: { create },
    } as never;

    await expect(createQrisInvoiceAttempt({
      orderId: "order-after-archive",
      amount: 3_055,
      expiresAt: new Date(Date.now() + 60_000),
    }, client)).rejects.toMatchObject({ code: "ACTIVE_MERCHANT_REQUIRED" });
    expect(create).not.toHaveBeenCalled();
  });

  it("never falls back to another merchant when a snapshot is unreadable", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PAYMENT_QRIS_BASE_PAYLOAD = staticPayload();

    await expect(renderQrisInvoice({
      amount: 3_055,
      attempt: {
        merchantNameSnapshot: "Broken merchant",
        providerKeySnapshot: "DANA",
        encryptedBasePayloadSnapshot: "broken",
        basePayloadEncryptionIvSnapshot: "broken",
        basePayloadEncryptionTagSnapshot: "broken",
        amount: 3_055,
      },
    })).rejects.toThrow("Payload QRIS tersimpan tidak dapat dibaca");
  });

  it("rejects an invoice connected to zero or two targets", async () => {
    await expect(
      createQrisInvoiceAttempt({
        amount: 1_000,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: "INVALID_INVOICE_TARGET" });

    await expect(
      createQrisInvoiceAttempt({
        orderId: "order-1",
        walletTopupId: "topup-1",
        amount: 1_000,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toMatchObject({ code: "INVALID_INVOICE_TARGET" });
  });

  it("requires an active validated Shopee session for web-session evidence and snapshots its account", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encryptedBase = encryptSecret(staticPayload());
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "attempt-web-1",
      ...data,
    }));
    const sessionFind = vi.fn().mockResolvedValue({
      id: "session-1",
      merchantAccountFingerprint: "a".repeat(64),
    });
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "merchant-1",
          slug: "shopee",
          name: "Shopee",
          providerKey: "SHOPEE_PARTNER",
          trustedPackageNames: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          trustedDeviceId: "device-1",
          encryptedBasePayload: encryptedBase.encryptedPayload,
          basePayloadEncryptionIv: encryptedBase.encryptionIv,
          basePayloadEncryptionTag: encryptedBase.encryptionTag,
          shopeeAccountFingerprint: "a".repeat(64),
        }),
      },
      storeRuntimeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      shopeePartnerSession: { findFirst: sessionFind },
      qrisInvoiceAttempt: { create },
    } as never;

    const result = await createQrisInvoiceAttempt({
      orderId: "order-web-1",
      amount: 85_039,
      expiresAt: new Date(Date.now() + 60_000),
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: "session-1",
    }, client);
    expect(sessionFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "session-1", status: "ACTIVE" }),
    }));
    expect(result).toMatchObject({
      evidenceMode: "WEB_SESSION",
      shopeeSessionIdSnapshot: "session-1",
      shopeeAccountFingerprintSnapshot: "a".repeat(64),
    });
  });

  it("defaults new Shopee invoices to the latest validated web session when enabled", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.SHOPEE_WEB_SESSION_CHECKOUT_ENABLED = "true";
    const encryptedBase = encryptSecret(staticPayload());
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "attempt-web-default-1",
      ...data,
    }));
    const sessionFind = vi.fn().mockResolvedValue({
      id: "session-latest",
      merchantAccountFingerprint: "a".repeat(64),
    });
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "merchant-1",
          slug: "shopee",
          name: "Shopee",
          providerKey: "SHOPEE_PARTNER",
          trustedPackageNames: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          trustedDeviceId: "device-1",
          encryptedBasePayload: encryptedBase.encryptedPayload,
          basePayloadEncryptionIv: encryptedBase.encryptionIv,
          basePayloadEncryptionTag: encryptedBase.encryptionTag,
          shopeeAccountFingerprint: "a".repeat(64),
        }),
      },
      storeRuntimeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      shopeePartnerSession: { findFirst: sessionFind },
      qrisInvoiceAttempt: { create },
    } as never;

    const result = await createQrisInvoiceAttempt({
      orderId: "order-web-default-1",
      amount: 85_039,
      expiresAt: new Date(Date.now() + 60_000),
    }, client);

    expect(sessionFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: "ACTIVE",
        merchantAccountFingerprint: "a".repeat(64),
      }),
      orderBy: [{ lastValidatedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    }));
    expect(result).toMatchObject({
      evidenceMode: "WEB_SESSION",
      shopeeSessionIdSnapshot: "session-latest",
      shopeeAccountFingerprintSnapshot: "a".repeat(64),
    });
  });

  it("rejects a validated session whose account differs from the QRIS merchant binding", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encryptedBase = encryptSecret(staticPayload());
    const create = vi.fn();
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "merchant-1",
          slug: "shopee",
          name: "Shopee",
          providerKey: "SHOPEE_PARTNER",
          trustedPackageNames: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          trustedDeviceId: "device-1",
          encryptedBasePayload: encryptedBase.encryptedPayload,
          basePayloadEncryptionIv: encryptedBase.encryptionIv,
          basePayloadEncryptionTag: encryptedBase.encryptionTag,
          shopeeAccountFingerprint: "a".repeat(64),
        }),
      },
      storeRuntimeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      shopeePartnerSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-2",
          merchantAccountFingerprint: "b".repeat(64),
        }),
      },
      qrisInvoiceAttempt: { create },
    } as never;

    await expect(createQrisInvoiceAttempt({
      orderId: "order-web-mismatch",
      amount: 85_039,
      expiresAt: new Date(Date.now() + 60_000),
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: "session-2",
    }, client)).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_MISMATCH" });
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects web-session evidence when the Shopee QRIS has no account binding", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const encryptedBase = encryptSecret(staticPayload());
    const client = {
      qrisMerchant: {
        findFirst: vi.fn().mockResolvedValue({
          id: "merchant-1",
          slug: "shopee",
          name: "Shopee",
          providerKey: "SHOPEE_PARTNER",
          trustedPackageNames: [SHOPEE_PARTNER_ANDROID_PACKAGE],
          trustedDeviceId: "device-1",
          encryptedBasePayload: encryptedBase.encryptedPayload,
          basePayloadEncryptionIv: encryptedBase.encryptionIv,
          basePayloadEncryptionTag: encryptedBase.encryptionTag,
          shopeeAccountFingerprint: null,
        }),
      },
      shopeePartnerSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-1",
          merchantAccountFingerprint: "a".repeat(64),
        }),
      },
      qrisInvoiceAttempt: { create: vi.fn() },
    } as never;

    await expect(createQrisInvoiceAttempt({
      orderId: "order-web-unbound",
      amount: 85_039,
      expiresAt: new Date(Date.now() + 60_000),
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: "session-1",
    }, client)).rejects.toMatchObject({ code: "SHOPEE_ACCOUNT_REQUIRED" });
  });

  it("keeps the default Android evidence mode and rejects a web mode on DANA", async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    process.env.PAYMENT_QRIS_BASE_PAYLOAD = staticPayload();
    const clientShape = {
      qrisMerchant: { findFirst: vi.fn().mockResolvedValue(null) },
      storeRuntimeSetting: { findUnique: vi.fn().mockResolvedValue(null) },
      qrisInvoiceAttempt: { create: vi.fn() },
      shopeePartnerSession: { findFirst: vi.fn() },
    };
    const client = clientShape as never;
    const create = clientShape.qrisInvoiceAttempt.create;
    await expect(createQrisInvoiceAttempt({
      orderId: "order-dana",
      amount: 1_000,
      expiresAt: new Date(Date.now() + 60_000),
    }, client)).resolves.toMatchObject({});
    await expect(createQrisInvoiceAttempt({
      orderId: "order-dana-web",
      amount: 1_000,
      expiresAt: new Date(Date.now() + 60_000),
      evidenceMode: "WEB_SESSION",
      shopeeSessionId: "session-1",
    }, client)).rejects.toMatchObject({ code: "INVALID_EVIDENCE_MODE" });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
