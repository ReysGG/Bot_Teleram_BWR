import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { optionalEnv } from "@/server/env";
import { normalizeAndValidateStaticQrisPayload } from "@/server/payment/qris";
import { getQrisProviderDefinition } from "@/server/payment/qris-provider-registry";
import { encryptSecret, sha256 } from "@/server/security/crypto";

const STORE_RUNTIME_ID = "global";
const ACTIVATION_LOCK = "telegram_qris_merchant_activation";
const IMPORT_SLUG = "legacy-dana-import";
const IMPORT_NAME = "DANA QRIS (impor env)";

export type LegacyQrisErrorCode =
  | "LEGACY_PAYLOAD_MISSING"
  | "LEGACY_PAYLOAD_INVALID"
  | "LEGACY_DEVICE_AMBIGUOUS";

export class LegacyQrisError extends Error {
  constructor(
    public readonly code: LegacyQrisErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "LegacyQrisError";
  }
}

export function legacyQrisErrorCode(error: unknown): LegacyQrisErrorCode | null {
  return error instanceof LegacyQrisError ? error.code : null;
}

type LegacyQrisReadClient = Pick<
  Prisma.TransactionClient,
  "qrisMerchant" | "storeRuntimeSetting"
>;

type LegacyQrisDatabase = Pick<typeof prisma, "$transaction">;

type LegacyQrisEnvironment = {
  payload: string;
  fingerprint: string;
  allowedDeviceIds: string[];
};

export type LegacyQrisFallbackStatus = {
  configured: boolean;
  valid: boolean;
  enabled: boolean;
  selectedForCheckout: boolean;
  blockedByActiveMerchant: boolean;
  fingerprint: string | null;
  allowedDeviceCount: number;
  activeMerchantName: string | null;
  updatedAt: Date | null;
  updatedBy: string | null;
};

function normalizeActor(actor: string): string {
  const normalized = actor.trim();
  if (!normalized || normalized.length > 160) {
    throw new Error("QRIS audit actor is invalid");
  }
  return normalized;
}

function normalizeLegacyDeviceId(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  if (
    normalized.length < 8 ||
    normalized.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    throw new LegacyQrisError(
      "LEGACY_PAYLOAD_INVALID",
      "Daftar device ID QRIS legacy tidak valid.",
    );
  }
  return normalized;
}

export function legacyQrisAllowedDeviceIds(): string[] {
  const raw = optionalEnv("DANA_ANDROID_BRIDGE_DEVICE_IDS");
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map(normalizeLegacyDeviceId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
}

export function requireLegacyQrisEnvironment(): LegacyQrisEnvironment {
  const raw = optionalEnv("PAYMENT_QRIS_BASE_PAYLOAD");
  if (!raw) {
    throw new LegacyQrisError(
      "LEGACY_PAYLOAD_MISSING",
      "Payload QRIS legacy belum tersedia di environment server.",
    );
  }
  try {
    const payload = normalizeAndValidateStaticQrisPayload(raw);
    return {
      payload,
      fingerprint: sha256(payload),
      allowedDeviceIds: legacyQrisAllowedDeviceIds(),
    };
  } catch (error) {
    if (error instanceof LegacyQrisError) throw error;
    throw new LegacyQrisError(
      "LEGACY_PAYLOAD_INVALID",
      "Payload QRIS legacy di environment tidak valid atau CRC-nya tidak cocok.",
    );
  }
}

export async function getLegacyQrisFallbackStatus(
  client: LegacyQrisReadClient = prisma,
): Promise<LegacyQrisFallbackStatus> {
  const [setting, activeMerchant] = await Promise.all([
    client.storeRuntimeSetting.findUnique({
      where: { id: STORE_RUNTIME_ID },
      select: {
        legacyQrisFallbackEnabled: true,
        legacyQrisFallbackUpdatedAt: true,
        legacyQrisFallbackUpdatedBy: true,
      },
    }),
    client.qrisMerchant.findFirst({
      where: { isActive: true, enabled: true, archivedAt: null },
      select: { name: true },
    }),
  ]);

  let environment: LegacyQrisEnvironment | null = null;
  let configured = Boolean(optionalEnv("PAYMENT_QRIS_BASE_PAYLOAD"));
  try {
    environment = requireLegacyQrisEnvironment();
  } catch {
    environment = null;
  }
  const enabled = setting?.legacyQrisFallbackEnabled ?? true;

  return {
    configured,
    valid: Boolean(environment),
    enabled,
    selectedForCheckout: enabled && Boolean(environment) && !activeMerchant,
    blockedByActiveMerchant: enabled && Boolean(activeMerchant),
    fingerprint: environment?.fingerprint ?? null,
    allowedDeviceCount: environment?.allowedDeviceIds.length ?? 0,
    activeMerchantName: activeMerchant?.name ?? null,
    updatedAt: setting?.legacyQrisFallbackUpdatedAt ?? null,
    updatedBy: setting?.legacyQrisFallbackUpdatedBy ?? null,
  };
}

function legacySettingData(enabled: boolean, actor: string, updatedAt: Date) {
  return {
    legacyQrisFallbackEnabled: enabled,
    legacyQrisFallbackUpdatedAt: updatedAt,
    legacyQrisFallbackUpdatedBy: actor,
    updatedBy: actor,
  };
}

export async function setLegacyQrisFallbackEnabled(
  input: { enabled: boolean; actor: string },
  database: LegacyQrisDatabase = prisma,
) {
  const actor = normalizeActor(input.actor);
  if (input.enabled) requireLegacyQrisEnvironment();

  return database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    const updatedAt = new Date();
    if (input.enabled) {
      await tx.qrisMerchant.updateMany({
        where: { isActive: true },
        data: {
          isActive: false,
          activatedAt: null,
          activatedBy: null,
          updatedBy: actor,
        },
      });
    }
    const data = legacySettingData(input.enabled, actor, updatedAt);
    return tx.storeRuntimeSetting.upsert({
      where: { id: STORE_RUNTIME_ID },
      create: { id: STORE_RUNTIME_ID, ...data },
      update: data,
    });
  });
}

async function availableImportSlug(tx: Prisma.TransactionClient): Promise<string> {
  for (let suffix = 1; suffix <= 1_000; suffix += 1) {
    const slug = suffix === 1 ? IMPORT_SLUG : `${IMPORT_SLUG}-${suffix}`;
    const existing = await tx.qrisMerchant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  throw new Error("Tidak dapat membuat slug merchant QRIS impor yang unik.");
}

export async function importLegacyQrisFallback(
  input: { actor: string },
  database: LegacyQrisDatabase = prisma,
): Promise<{ merchantId: string; created: boolean }> {
  const actor = normalizeActor(input.actor);
  const environment = requireLegacyQrisEnvironment();
  if (environment.allowedDeviceIds.length > 1) {
    throw new LegacyQrisError(
      "LEGACY_DEVICE_AMBIGUOUS",
      "QRIS legacy memiliki lebih dari satu device ID. Sisakan satu device sebelum impor agar routing Android tidak berubah diam-diam.",
    );
  }
  const encrypted = encryptSecret(environment.payload);
  const provider = getQrisProviderDefinition("DANA");

  return database.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ACTIVATION_LOCK}))`;
    const updatedAt = new Date();
    const existing = await tx.qrisMerchant.findFirst({
      where: {
        providerKey: provider.key,
        payloadFingerprint: environment.fingerprint,
        archivedAt: null,
      },
      select: { id: true },
    });

    await tx.qrisMerchant.updateMany({
      where: { isActive: true, ...(existing ? { id: { not: existing.id } } : {}) },
      data: {
        isActive: false,
        activatedAt: null,
        activatedBy: null,
        updatedBy: actor,
      },
    });

    let merchantId: string;
    let created = false;
    if (existing) {
      const merchant = await tx.qrisMerchant.update({
        where: { id: existing.id },
        data: {
          encryptedBasePayload: encrypted.encryptedPayload,
          basePayloadEncryptionIv: encrypted.encryptionIv,
          basePayloadEncryptionTag: encrypted.encryptionTag,
          trustedDeviceId: environment.allowedDeviceIds[0] ?? null,
          enabled: true,
          isActive: true,
          activatedAt: updatedAt,
          activatedBy: actor,
          updatedBy: actor,
        },
        select: { id: true },
      });
      merchantId = merchant.id;
    } else {
      const slug = await availableImportSlug(tx);
      const merchant = await tx.qrisMerchant.create({
        data: {
          slug,
          name: IMPORT_NAME,
          providerKey: provider.key,
          encryptedBasePayload: encrypted.encryptedPayload,
          basePayloadEncryptionIv: encrypted.encryptionIv,
          basePayloadEncryptionTag: encrypted.encryptionTag,
          payloadFingerprint: environment.fingerprint,
          trustedDeviceId: environment.allowedDeviceIds[0] ?? null,
          enabled: true,
          isActive: true,
          activatedAt: updatedAt,
          activatedBy: actor,
          createdBy: actor,
          updatedBy: actor,
        },
        select: { id: true },
      });
      merchantId = merchant.id;
      created = true;
    }

    const setting = legacySettingData(false, actor, updatedAt);
    await tx.storeRuntimeSetting.upsert({
      where: { id: STORE_RUNTIME_ID },
      create: { id: STORE_RUNTIME_ID, ...setting },
      update: setting,
    });
    return { merchantId, created };
  });
}
