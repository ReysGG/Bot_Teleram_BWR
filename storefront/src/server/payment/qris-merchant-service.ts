import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { booleanEnv } from "@/server/env";
import {
  decryptSecret,
  encryptSecret,
  sha256,
  type EncryptedPayload,
} from "@/server/security/crypto";
import {
  buildDynamicQrisPayload,
  normalizeAndValidateStaticQrisPayload,
} from "@/server/payment/qris";
import {
  getQrisProviderDefinition,
  isQrisProviderKey,
  type QrisProviderDefinition,
  type QrisProviderKey,
} from "@/server/payment/qris-provider-registry";
import {
  requireLegacyQrisEnvironment,
} from "@/server/payment/qris-legacy-service";
import {
  getAdminBridgeDeviceOption,
  type AdminBridgeDeviceOption,
} from "@/server/payment/bridge-device-options";
import {
  qrisMerchantActivationReadiness,
  type QrisMerchantActivationErrorCode,
} from "@/server/payment/qris-merchant-activation-policy";

const ACTIVATION_LOCK = "telegram_qris_merchant_activation";
const LEGACY_ENV_SLUG = "legacy-dana-env";
const STORE_RUNTIME_ID = "global";
const SHOPEE_WEB_SESSION_CHECKOUT_ENV = "SHOPEE_WEB_SESSION_CHECKOUT_ENABLED";

export type QrisMerchantErrorCode =
  | "INVALID_SLUG"
  | "INVALID_NAME"
  | "INVALID_PROVIDER"
  | "INVALID_STATIC_PAYLOAD"
  | "PAYLOAD_UNREADABLE"
  | "MERCHANT_NOT_FOUND"
  | "MERCHANT_ARCHIVED"
  | "MERCHANT_DISABLED"
  | "INVALID_DEVICE_ID"
  | QrisMerchantActivationErrorCode
  | "ACTIVE_MERCHANT_REQUIRED"
  | "INVALID_INVOICE_TARGET"
  | "INVALID_AMOUNT"
  | "INVALID_EXPIRY"
  | "INVALID_EVIDENCE_MODE"
  | "SHOPEE_SESSION_REQUIRED"
  | "SHOPEE_SESSION_INVALID"
  | "SHOPEE_ACCOUNT_REQUIRED"
  | "SHOPEE_ACCOUNT_MISMATCH";

export const QRIS_INVOICE_EVIDENCE_MODES = [
  "ANDROID_NOTIFICATION",
  "WEB_SESSION",
] as const;

export type QrisInvoiceEvidenceMode =
  (typeof QRIS_INVOICE_EVIDENCE_MODES)[number];

export function assertQrisEvidenceIdempotency(input: {
  attempt: {
    evidenceMode: string;
    shopeeSessionIdSnapshot: string | null;
  } | null | undefined;
  evidenceMode?: QrisInvoiceEvidenceMode;
  shopeeSessionId?: string | null;
  message?: string;
}): void {
  if (input.evidenceMode === undefined && input.shopeeSessionId === undefined) {
    return;
  }
  const expectedMode = input.evidenceMode ?? "ANDROID_NOTIFICATION";
  const requestedSessionId = input.shopeeSessionId?.trim() ?? null;
  if (
    !input.attempt ||
    input.attempt.evidenceMode !== expectedMode ||
    (input.shopeeSessionId !== undefined &&
      input.attempt.shopeeSessionIdSnapshot !== requestedSessionId)
  ) {
    throw new Error(
      input.message ?? "Idempotency key sudah digunakan untuk bukti QRIS berbeda",
    );
  }
}

export class QrisMerchantError extends Error {
  constructor(
    public readonly code: QrisMerchantErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QrisMerchantError";
  }
}

export function qrisMerchantErrorCode(
  error: unknown,
): QrisMerchantErrorCode | null {
  return error instanceof QrisMerchantError ? error.code : null;
}

export type QrisMerchantView = {
  id: string;
  slug: string;
  name: string;
  providerKey: QrisProviderKey;
  providerName: string;
  providerReady: boolean;
  usesDanaRelay: boolean;
  trustedPackageNames: readonly string[];
  trustedDeviceId: string | null;
  providerNotReadyReason: string | null;
  enabled: boolean;
  isActive: boolean;
  archivedAt: Date | null;
  archivedBy: string | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  payloadFingerprint: string;
  shopeeAccountFingerprint: string | null;
  hasBasePayload: true;
};

export type ResolvedQrisCheckoutMerchant = {
  source: "DATABASE" | "ENV";
  merchantId: string | null;
  slug: string;
  name: string;
  providerKey: QrisProviderKey;
  trustedPackageNames: readonly string[];
  allowedDeviceIds: readonly string[];
  shopeeAccountFingerprint: string | null;
  basePayload: string;
};

type QrisMerchantReadClient = Pick<
  Prisma.TransactionClient,
  "qrisMerchant"
>;

type QrisCheckoutReadClient = Pick<
  Prisma.TransactionClient,
  "qrisMerchant" | "storeRuntimeSetting"
>;

type QrisInvoiceWriteClient = Pick<
  Prisma.TransactionClient,
  | "qrisMerchant"
  | "qrisInvoiceAttempt"
  | "storeRuntimeSetting"
  | "shopeePartnerSession"
>;

const publicMerchantSelect = {
  id: true,
  slug: true,
  name: true,
  providerKey: true,
  enabled: true,
  isActive: true,
  activatedAt: true,
  activatedBy: true,
  archivedAt: true,
  archivedBy: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  payloadFingerprint: true,
  trustedDeviceId: true,
  shopeeAccountFingerprint: true,
} satisfies Prisma.QrisMerchantSelect;

type PublicMerchantRow = Prisma.QrisMerchantGetPayload<{
  select: typeof publicMerchantSelect;
}>;

function normalizeActor(actor: string): string {
  const normalized = actor.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("QRIS audit actor is invalid");
  }
  return normalized;
}

function normalizeSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) || normalized.length > 64) {
    throw new QrisMerchantError(
      "INVALID_SLUG",
      "Slug merchant QRIS harus berupa huruf kecil, angka, atau tanda hubung.",
    );
  }
  return normalized;
}

function normalizeName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 2 || normalized.length > 100) {
    throw new QrisMerchantError(
      "INVALID_NAME",
      "Nama merchant QRIS harus terdiri dari 2-100 karakter.",
    );
  }
  return normalized;
}

function normalizeTrustedDeviceId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length < 8 || normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new QrisMerchantError(
      "INVALID_DEVICE_ID",
      "Device ID bridge harus sama persis dengan ID perangkat Android (8-200 karakter).",
    );
  }
  return normalized;
}

function normalizeShopeeSessionId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length > 200 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new QrisMerchantError(
      "SHOPEE_SESSION_INVALID",
      "Session Shopee Partner yang dipilih tidak valid.",
    );
  }
  return normalized;
}

function normalizeShopeeAccountFingerprint(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return null;
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new QrisMerchantError(
      "SHOPEE_SESSION_INVALID",
      "Session Shopee Partner belum memiliki identitas akun yang tervalidasi.",
    );
  }
  return normalized;
}

type ShopeeSessionLookupClient = Pick<
  Prisma.TransactionClient,
  "shopeePartnerSession"
>;

async function resolveShopeeAccountFingerprint(
  sessionId: string | null,
  client: ShopeeSessionLookupClient,
): Promise<string | null> {
  if (!sessionId) return null;
  const session = await client.shopeePartnerSession.findFirst({
    where: {
      id: sessionId,
      status: "ACTIVE",
      merchantAccountFingerprint: { not: null },
      merchantId: { not: null },
      storeId: { not: null },
      lastValidatedAt: { not: null },
    },
    select: {
      merchantAccountFingerprint: true,
    },
  });
  const fingerprint = normalizeShopeeAccountFingerprint(
    session?.merchantAccountFingerprint,
  );
  if (!fingerprint) {
    throw new QrisMerchantError(
      "SHOPEE_SESSION_INVALID",
      "Session Shopee Partner belum tervalidasi atau sudah tidak aktif.",
    );
  }
  return fingerprint;
}

async function disableLegacyQrisFallback(
  tx: Pick<Prisma.TransactionClient, "storeRuntimeSetting">,
  actor: string,
  updatedAt: Date,
) {
  const data = {
    legacyQrisFallbackEnabled: false,
    legacyQrisFallbackUpdatedAt: updatedAt,
    legacyQrisFallbackUpdatedBy: actor,
    updatedBy: actor,
  };
  await tx.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: { id: STORE_RUNTIME_ID, ...data },
    update: data,
  });
}

function providerDefinition(providerKey: string): QrisProviderDefinition {
  if (!isQrisProviderKey(providerKey)) {
    throw new QrisMerchantError(
      "INVALID_PROVIDER",
      "Provider QRIS belum didukung aplikasi.",
    );
  }
  return getQrisProviderDefinition(providerKey);
}

function validatedPayload(payload: string): string {
  try {
    return normalizeAndValidateStaticQrisPayload(payload);
  } catch {
    throw new QrisMerchantError(
      "INVALID_STATIC_PAYLOAD",
      "Payload QRIS statis tidak valid atau CRC-nya tidak cocok.",
    );
  }
}

function decryptValidatedPayload(payload: EncryptedPayload): string {
  try {
    return normalizeAndValidateStaticQrisPayload(decryptSecret(payload));
  } catch {
    throw new QrisMerchantError(
      "PAYLOAD_UNREADABLE",
      "Payload QRIS tersimpan tidak dapat dibaca atau tidak lagi valid.",
    );
  }
}

async function assertProviderCanActivate(
  provider: QrisProviderDefinition,
  trustedDeviceId: string | null,
  client: Pick<Prisma.TransactionClient, "bridgeDeviceStatus"> = prisma,
): Promise<void> {
  const bridgeDevice = provider.key === "SHOPEE_PARTNER" && trustedDeviceId
    ? await getAdminBridgeDeviceOption(trustedDeviceId, client)
    : null;
  const readiness = qrisMerchantActivationReadiness(
    provider,
    trustedDeviceId,
    bridgeDevice ? [bridgeDevice] : [],
  );
  if (!readiness.canActivate) {
    throw new QrisMerchantError(readiness.code, readiness.reason);
  }
}

export function qrisMerchantViewActivationReadiness(
  merchant: Pick<
    QrisMerchantView,
    "providerKey" | "trustedDeviceId"
  >,
  bridgeDevices: readonly AdminBridgeDeviceOption[],
) {
  return qrisMerchantActivationReadiness(
    providerDefinition(merchant.providerKey),
    merchant.trustedDeviceId,
    bridgeDevices,
  );
}

function toMerchantView(row: PublicMerchantRow): QrisMerchantView {
  const provider = providerDefinition(row.providerKey);
  return {
    ...row,
    // Older test doubles and pre-binding rows may omit this nullable field.
    shopeeAccountFingerprint: row.shopeeAccountFingerprint ?? null,
    providerKey: provider.key,
    providerName: provider.displayName,
    providerReady: provider.ready,
    usesDanaRelay: provider.usesDanaRelay,
    trustedPackageNames: provider.trustedPackageNames,
    providerNotReadyReason: provider.notReadyReason,
    hasBasePayload: true,
  };
}

export async function listQrisMerchants(
  client: QrisMerchantReadClient = prisma,
): Promise<QrisMerchantView[]> {
  const rows = await client.qrisMerchant.findMany({
    select: publicMerchantSelect,
    orderBy: [
      { isActive: "desc" },
      { archivedAt: "asc" },
      { createdAt: "desc" },
      { id: "desc" },
    ],
  });
  return rows.map(toMerchantView);
}

export async function getQrisMerchant(
  idOrSlug: string,
  client: QrisMerchantReadClient = prisma,
): Promise<QrisMerchantView | null> {
  const key = idOrSlug.trim();
  if (!key) return null;
  const row = await client.qrisMerchant.findFirst({
    where: { OR: [{ id: key }, { slug: key.toLowerCase() }] },
    select: publicMerchantSelect,
  });
  return row ? toMerchantView(row) : null;
}

export async function getActiveQrisMerchant(
  client: QrisMerchantReadClient = prisma,
): Promise<QrisMerchantView | null> {
  const row = await client.qrisMerchant.findFirst({
    where: { isActive: true, enabled: true, archivedAt: null },
    select: publicMerchantSelect,
  });
  return row ? toMerchantView(row) : null;
}

export async function createQrisMerchant(input: {
  slug: string;
  name: string;
  providerKey: string;
  basePayload: string;
  enabled?: boolean;
  activateAfterSave?: boolean;
  trustedDeviceId?: string | null;
  shopeeSessionId?: string | null;
  actor: string;
}): Promise<QrisMerchantView> {
  const actor = normalizeActor(input.actor);
  const provider = providerDefinition(input.providerKey);
  const basePayload = validatedPayload(input.basePayload);
  const encrypted = encryptSecret(basePayload);
  const trustedDeviceId = normalizeTrustedDeviceId(input.trustedDeviceId);
  const shopeeSessionId = normalizeShopeeSessionId(input.shopeeSessionId);
  if (shopeeSessionId && provider.key !== "SHOPEE_PARTNER") {
    throw new QrisMerchantError(
      "INVALID_PROVIDER",
      "Session Shopee Partner hanya boleh diikat ke merchant Shopee Partner.",
    );
  }
  // The operator selects the validated session after checking the QRIS account.
  const shopeeAccountFingerprint = provider.key === "SHOPEE_PARTNER"
    ? await resolveShopeeAccountFingerprint(shopeeSessionId, prisma)
    : null;
  const activateAfterSave = input.activateAfterSave ?? false;
  const data: Prisma.QrisMerchantCreateInput = {
    slug: normalizeSlug(input.slug),
    name: normalizeName(input.name),
    providerKey: provider.key,
    encryptedBasePayload: encrypted.encryptedPayload,
    basePayloadEncryptionIv: encrypted.encryptionIv,
    basePayloadEncryptionTag: encrypted.encryptionTag,
    payloadFingerprint: sha256(basePayload),
    trustedDeviceId,
    shopeeAccountFingerprint,
    enabled: activateAfterSave ? true : (input.enabled ?? false),
    createdBy: actor,
    updatedBy: actor,
  };

  if (!activateAfterSave) {
    const row = await prisma.qrisMerchant.create({
      data,
      select: publicMerchantSelect,
    });
    return toMerchantView(row);
  }

  const row = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    await assertProviderCanActivate(provider, trustedDeviceId, tx);
    await tx.qrisMerchant.updateMany({
      where: { isActive: true },
      data: {
        isActive: false,
        activatedAt: null,
        activatedBy: null,
        updatedBy: actor,
      },
    });
    const activatedAt = new Date();
    await disableLegacyQrisFallback(tx, actor, activatedAt);
    return tx.qrisMerchant.create({
      data: {
        ...data,
        enabled: true,
        isActive: true,
        activatedAt,
        activatedBy: actor,
      },
      select: publicMerchantSelect,
    });
  });
  return toMerchantView(row);
}

export async function updateQrisMerchant(input: {
  id: string;
  slug?: string;
  name?: string;
  providerKey?: string;
  basePayload?: string;
  enabled?: boolean;
  trustedDeviceId?: string | null;
  shopeeSessionId?: string | null;
  actor: string;
}): Promise<QrisMerchantView> {
  const actor = normalizeActor(input.actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    const current = await tx.qrisMerchant.findUnique({ where: { id: input.id } });
    if (!current) {
      throw new QrisMerchantError("MERCHANT_NOT_FOUND", "Merchant QRIS tidak ditemukan.");
    }
    if (current.archivedAt) {
      throw new QrisMerchantError("MERCHANT_ARCHIVED", "Merchant QRIS sudah diarsipkan.");
    }

    const provider = providerDefinition(input.providerKey ?? current.providerKey);
    const enabled = input.enabled ?? current.enabled;
    const trustedDeviceId = input.trustedDeviceId === undefined
      ? current.trustedDeviceId
      : normalizeTrustedDeviceId(input.trustedDeviceId);
    const requestedShopeeSessionId = input.shopeeSessionId === undefined
      ? undefined
      : normalizeShopeeSessionId(input.shopeeSessionId);
    if (requestedShopeeSessionId && provider.key !== "SHOPEE_PARTNER") {
      throw new QrisMerchantError(
        "INVALID_PROVIDER",
        "Session Shopee Partner hanya boleh diikat ke merchant Shopee Partner.",
      );
    }
    const shopeeAccountFingerprint = provider.key !== "SHOPEE_PARTNER"
      ? null
      : requestedShopeeSessionId === undefined
        ? normalizeShopeeAccountFingerprint(current.shopeeAccountFingerprint)
        : await resolveShopeeAccountFingerprint(requestedShopeeSessionId, tx);
    if (current.isActive && enabled) {
      await assertProviderCanActivate(provider, trustedDeviceId, tx);
      if (input.basePayload === undefined) {
        decryptValidatedPayload({
          encryptedPayload: current.encryptedBasePayload,
          encryptionIv: current.basePayloadEncryptionIv,
          encryptionTag: current.basePayloadEncryptionTag,
        });
      }
    }

    const basePayload = input.basePayload
      ? validatedPayload(input.basePayload)
      : null;
    const encrypted = basePayload ? encryptSecret(basePayload) : null;
    const row = await tx.qrisMerchant.update({
      where: { id: current.id },
      data: {
        ...(input.slug === undefined ? {} : { slug: normalizeSlug(input.slug) }),
        ...(input.name === undefined ? {} : { name: normalizeName(input.name) }),
        providerKey: provider.key,
        trustedDeviceId,
        shopeeAccountFingerprint,
        enabled,
        isActive: enabled ? current.isActive : false,
        activatedAt: enabled ? current.activatedAt : null,
        activatedBy: enabled ? current.activatedBy : null,
        ...(encrypted
          ? {
              encryptedBasePayload: encrypted.encryptedPayload,
              basePayloadEncryptionIv: encrypted.encryptionIv,
              basePayloadEncryptionTag: encrypted.encryptionTag,
              payloadFingerprint: sha256(basePayload!),
            }
          : {}),
        updatedBy: actor,
      },
      select: publicMerchantSelect,
    });
    return toMerchantView(row);
  });
}

export async function activateQrisMerchant(input: {
  id: string;
  actor: string;
}): Promise<QrisMerchantView> {
  const actor = normalizeActor(input.actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    const merchant = await tx.qrisMerchant.findUnique({ where: { id: input.id } });
    if (!merchant) {
      throw new QrisMerchantError("MERCHANT_NOT_FOUND", "Merchant QRIS tidak ditemukan.");
    }
    if (merchant.archivedAt) {
      throw new QrisMerchantError("MERCHANT_ARCHIVED", "Merchant QRIS sudah diarsipkan.");
    }
    if (!merchant.enabled) {
      throw new QrisMerchantError(
        "MERCHANT_DISABLED",
        "Aktifkan merchant QRIS sebelum memilihnya untuk checkout.",
      );
    }

    const provider = providerDefinition(merchant.providerKey);
    await assertProviderCanActivate(provider, merchant.trustedDeviceId, tx);
    decryptValidatedPayload({
      encryptedPayload: merchant.encryptedBasePayload,
      encryptionIv: merchant.basePayloadEncryptionIv,
      encryptionTag: merchant.basePayloadEncryptionTag,
    });

    await tx.qrisMerchant.updateMany({
      where: { isActive: true, id: { not: merchant.id } },
      data: { isActive: false, activatedAt: null, activatedBy: null, updatedBy: actor },
    });
    const activatedAt = new Date();
    await disableLegacyQrisFallback(tx, actor, activatedAt);
    const row = await tx.qrisMerchant.update({
      where: { id: merchant.id },
      data: {
        isActive: true,
        activatedAt,
        activatedBy: actor,
        updatedBy: actor,
      },
      select: publicMerchantSelect,
    });
    return toMerchantView(row);
  });
}

export async function archiveQrisMerchant(input: {
  id: string;
  actor: string;
}): Promise<QrisMerchantView> {
  const actor = normalizeActor(input.actor);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    const current = await tx.qrisMerchant.findUnique({ where: { id: input.id } });
    if (!current) {
      throw new QrisMerchantError("MERCHANT_NOT_FOUND", "Merchant QRIS tidak ditemukan.");
    }
    const archivedAt = current.archivedAt ?? new Date();
    const row = await tx.qrisMerchant.update({
      where: { id: current.id },
      data: {
        enabled: false,
        isActive: false,
        activatedAt: null,
        activatedBy: null,
        archivedAt,
        archivedBy: current.archivedBy ?? actor,
        updatedBy: actor,
      },
      select: publicMerchantSelect,
    });
    return toMerchantView(row);
  });
}

export async function resolveQrisCheckoutMerchant(
  client: QrisCheckoutReadClient = prisma,
): Promise<ResolvedQrisCheckoutMerchant | null> {
  const merchant = await client.qrisMerchant.findFirst({
    where: { isActive: true, enabled: true, archivedAt: null },
  });
  if (merchant) {
    const provider = providerDefinition(merchant.providerKey);
    return {
      source: "DATABASE",
      merchantId: merchant.id,
      slug: merchant.slug,
      name: merchant.name,
      providerKey: provider.key,
      trustedPackageNames: provider.trustedPackageNames,
      allowedDeviceIds: merchant.trustedDeviceId ? [merchant.trustedDeviceId] : [],
      shopeeAccountFingerprint: provider.key === "SHOPEE_PARTNER"
        ? normalizeShopeeAccountFingerprint(merchant.shopeeAccountFingerprint)
        : null,
      basePayload: decryptValidatedPayload({
        encryptedPayload: merchant.encryptedBasePayload,
        encryptionIv: merchant.basePayloadEncryptionIv,
        encryptionTag: merchant.basePayloadEncryptionTag,
      }),
    };
  }

  const setting = await client.storeRuntimeSetting.findUnique({
    where: { id: STORE_RUNTIME_ID },
    select: { legacyQrisFallbackEnabled: true },
  });
  if (!(setting?.legacyQrisFallbackEnabled ?? true)) return null;
  let legacy;
  try {
    legacy = requireLegacyQrisEnvironment();
  } catch {
    return null;
  }
  const provider = getQrisProviderDefinition("DANA");
  return {
    source: "ENV",
    merchantId: null,
    slug: LEGACY_ENV_SLUG,
    name: provider.displayName,
    providerKey: provider.key,
    trustedPackageNames: provider.trustedPackageNames,
    allowedDeviceIds: legacy.allowedDeviceIds,
    shopeeAccountFingerprint: null,
    basePayload: legacy.payload,
  };
}

export async function createQrisInvoiceAttempt(
  input: {
    orderId?: string | null;
    walletTopupId?: string | null;
    amount: number;
    expiresAt: Date;
    evidenceMode?: QrisInvoiceEvidenceMode;
    shopeeSessionId?: string | null;
  },
  client: QrisInvoiceWriteClient = prisma,
) {
  if (Number(Boolean(input.orderId)) + Number(Boolean(input.walletTopupId)) !== 1) {
    throw new QrisMerchantError(
      "INVALID_INVOICE_TARGET",
      "Invoice QRIS harus terhubung ke tepat satu order atau top up wallet.",
    );
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new QrisMerchantError("INVALID_AMOUNT", "Nominal invoice QRIS tidak valid.");
  }
  if (!(input.expiresAt instanceof Date) || input.expiresAt.getTime() <= Date.now()) {
    throw new QrisMerchantError("INVALID_EXPIRY", "Waktu kedaluwarsa QRIS tidak valid.");
  }

  const requestedEvidenceMode = input.evidenceMode;
  if (
    requestedEvidenceMode !== undefined &&
    !(QRIS_INVOICE_EVIDENCE_MODES as readonly string[]).includes(requestedEvidenceMode)
  ) {
    throw new QrisMerchantError(
      "INVALID_EVIDENCE_MODE",
      "Mode bukti pembayaran QRIS tidak valid.",
    );
  }

  const merchant = await resolveQrisCheckoutMerchant(client);
  if (!merchant) {
    throw new QrisMerchantError(
      "ACTIVE_MERCHANT_REQUIRED",
      "Belum ada merchant QRIS aktif untuk membuat invoice.",
    );
  }

  const evidenceMode = requestedEvidenceMode ?? (
    merchant.providerKey === "SHOPEE_PARTNER" &&
    booleanEnv(SHOPEE_WEB_SESSION_CHECKOUT_ENV, false)
      ? "WEB_SESSION"
      : "ANDROID_NOTIFICATION"
  );
  if (evidenceMode !== "WEB_SESSION" && input.shopeeSessionId) {
    throw new QrisMerchantError(
      "INVALID_EVIDENCE_MODE",
      "Session Shopee hanya boleh dipakai pada mode web-session.",
    );
  }

  let shopeeSessionIdSnapshot: string | null = null;
  let shopeeAccountFingerprintSnapshot: string | null = null;
  if (evidenceMode === "WEB_SESSION") {
    if (merchant.providerKey !== "SHOPEE_PARTNER") {
      throw new QrisMerchantError(
        "INVALID_EVIDENCE_MODE",
        "Mode web-session hanya tersedia untuk merchant Shopee Partner.",
      );
    }
    const merchantAccountFingerprint = normalizeShopeeAccountFingerprint(
      merchant.shopeeAccountFingerprint,
    );
    if (!merchantAccountFingerprint) {
      throw new QrisMerchantError(
        "SHOPEE_ACCOUNT_REQUIRED",
        "Merchant QRIS Shopee belum diikat ke akun Shopee Partner. Pilih session aktif yang sesuai di pengaturan merchant.",
      );
    }
    const requestedSessionId = normalizeShopeeSessionId(input.shopeeSessionId);
    if (!requestedSessionId && requestedEvidenceMode === "WEB_SESSION") {
      throw new QrisMerchantError(
        "SHOPEE_SESSION_REQUIRED",
        "Session Shopee Partner harus dipilih untuk invoice web-session.",
      );
    }
    const session = await client.shopeePartnerSession.findFirst({
      where: {
        ...(requestedSessionId
          ? { id: requestedSessionId }
          : { merchantAccountFingerprint }),
        status: "ACTIVE",
        merchantId: { not: null },
        storeId: { not: null },
        lastValidatedAt: { not: null },
      },
      ...(!requestedSessionId
        ? { orderBy: [{ lastValidatedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }] }
        : {}),
      select: {
        id: true,
        merchantAccountFingerprint: true,
      },
    });
    if (
      !session?.merchantAccountFingerprint ||
      !/^[a-f0-9]{64}$/.test(session.merchantAccountFingerprint)
    ) {
      throw new QrisMerchantError(
        "SHOPEE_SESSION_INVALID",
        "Session Shopee Partner belum tervalidasi atau sudah tidak aktif.",
      );
    }
    if (merchantAccountFingerprint !== session.merchantAccountFingerprint) {
      throw new QrisMerchantError(
        "SHOPEE_ACCOUNT_MISMATCH",
        "Session Shopee Partner tidak cocok dengan akun merchant QRIS yang dipilih.",
      );
    }
    shopeeSessionIdSnapshot = session.id;
    shopeeAccountFingerprintSnapshot = merchantAccountFingerprint;
  }

  const encrypted = encryptSecret(merchant.basePayload);
  return client.qrisInvoiceAttempt.create({
    data: {
      orderId: input.orderId || null,
      walletTopupId: input.walletTopupId || null,
      qrisMerchantId: merchant.merchantId,
      merchantSlugSnapshot: merchant.slug,
      merchantNameSnapshot: merchant.name,
      providerKeySnapshot: merchant.providerKey,
      allowedPackageNamesSnapshot: [...merchant.trustedPackageNames],
      allowedDeviceIdsSnapshot: [...merchant.allowedDeviceIds],
      encryptedBasePayloadSnapshot: encrypted.encryptedPayload,
      basePayloadEncryptionIvSnapshot: encrypted.encryptionIv,
      basePayloadEncryptionTagSnapshot: encrypted.encryptionTag,
      amount: input.amount,
      evidenceMode,
      expiresAt: input.expiresAt,
      shopeeSessionIdSnapshot,
      shopeeAccountFingerprintSnapshot,
    },
  });
}

export function buildDynamicQrisPayloadForAttempt(input: {
  encryptedBasePayloadSnapshot: string;
  basePayloadEncryptionIvSnapshot: string;
  basePayloadEncryptionTagSnapshot: string;
  amount: number;
}): string {
  const basePayload = decryptValidatedPayload({
    encryptedPayload: input.encryptedBasePayloadSnapshot,
    encryptionIv: input.basePayloadEncryptionIvSnapshot,
    encryptionTag: input.basePayloadEncryptionTagSnapshot,
  });
  return buildDynamicQrisPayload(basePayload, input.amount);
}
