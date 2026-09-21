import { prisma } from "@/server/db/prisma";
import {
  decryptShopeeCookieJar,
  encryptShopeeCookieJar,
  parseShopeeCookieExport,
  shopeeCookieFingerprint,
  type ShopeeCookie,
} from "@/server/payment/shopee-cookie";
import {
  decryptShopeePartnerApiToken,
  encryptShopeePartnerApiToken,
  normalizeShopeePartnerApiToken,
  shopeePartnerApiTokenFingerprint,
} from "@/server/payment/shopee-partner-credential";

function actor(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error("Invalid audit actor");
  return normalized;
}

export type ShopeePartnerSessionView = {
  id: string;
  name: string;
  cookieFingerprint: string | null;
  apiTokenFingerprint: string | null;
  merchantAccountFingerprint: string | null;
  merchantId: string | null;
  storeId: string | null;
  status: string;
  lastValidatedAt: Date | null;
  lastSuccessfulPollAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type ShopeePartnerSessionOption = {
  id: string;
  name: string;
  merchantAccountFingerprint: string;
  merchantId: string;
  storeId: string;
  lastValidatedAt: Date | null;
};

const viewSelect = {
  id: true,
  name: true,
  cookieFingerprint: true,
  apiTokenFingerprint: true,
  merchantAccountFingerprint: true,
  merchantId: true,
  storeId: true,
  status: true,
  lastValidatedAt: true,
  lastSuccessfulPollAt: true,
  lastErrorCode: true,
  lastErrorAt: true,
  revokedAt: true,
  revokedBy: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createShopeePartnerSession(input: {
  name: string;
  cookieExport: unknown;
  apiToken: string;
  actor: string;
}): Promise<ShopeePartnerSessionView> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) throw new Error("Invalid Shopee session name");
  const cookies = parseShopeeCookieExport(input.cookieExport);
  const apiToken = normalizeShopeePartnerApiToken(input.apiToken);
  const encryptedCookies = encryptShopeeCookieJar(cookies);
  const encryptedToken = encryptShopeePartnerApiToken(apiToken);
  return prisma.shopeePartnerSession.create({
    data: {
      name,
      encryptedCookieJar: encryptedCookies.encryptedPayload,
      cookieEncryptionIv: encryptedCookies.encryptionIv,
      cookieEncryptionTag: encryptedCookies.encryptionTag,
      cookieFingerprint: shopeeCookieFingerprint(cookies),
      encryptedApiToken: encryptedToken.encryptedPayload,
      apiTokenEncryptionIv: encryptedToken.encryptionIv,
      apiTokenEncryptionTag: encryptedToken.encryptionTag,
      apiTokenFingerprint: shopeePartnerApiTokenFingerprint(apiToken),
      status: "PENDING_VALIDATION",
      createdBy: actor(input.actor),
      updatedBy: actor(input.actor),
    },
    select: viewSelect,
  });
}

export async function listShopeePartnerSessions(): Promise<ShopeePartnerSessionView[]> {
  return prisma.shopeePartnerSession.findMany({
    select: viewSelect,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
}

/** Safe selector data for QRIS merchant binding; no cookie/token material leaves the server. */
export async function listActiveShopeePartnerSessionOptions(): Promise<ShopeePartnerSessionOption[]> {
  return prisma.shopeePartnerSession.findMany({
    where: {
      status: "ACTIVE",
      merchantAccountFingerprint: { not: null },
      merchantId: { not: null },
      storeId: { not: null },
      lastValidatedAt: { not: null },
    },
    select: {
      id: true,
      name: true,
      merchantAccountFingerprint: true,
      merchantId: true,
      storeId: true,
      lastValidatedAt: true,
    },
    orderBy: [{ name: "asc" }, { updatedAt: "desc" }],
  }).then((rows) => rows.flatMap((row) => (
    row.merchantAccountFingerprint && row.merchantId && row.storeId
      ? [{
          id: row.id,
          name: row.name,
          merchantAccountFingerprint: row.merchantAccountFingerprint,
          merchantId: row.merchantId,
          storeId: row.storeId,
          lastValidatedAt: row.lastValidatedAt,
        }]
      : []
  )));
}

export async function readShopeePartnerCredentials(
  id: string,
  pollingLeaseToken?: string,
): Promise<{ cookies: ShopeeCookie[]; apiToken: string }> {
  const row = await prisma.shopeePartnerSession.findFirstOrThrow({
    where: {
      id,
      ...(pollingLeaseToken
        ? {
            pollingLeaseToken,
            OR: [
              { status: { in: ["PENDING_VALIDATION", "ACTIVE"] } },
              { status: "ERROR", lastErrorCode: "WORKER_ERROR" },
            ],
          }
        : { status: { in: ["PENDING_VALIDATION", "ACTIVE"] } }),
    },
    select: {
      encryptedCookieJar: true,
      cookieEncryptionIv: true,
      cookieEncryptionTag: true,
      encryptedApiToken: true,
      apiTokenEncryptionIv: true,
      apiTokenEncryptionTag: true,
    },
  });
  if (
    !row.encryptedCookieJar || !row.cookieEncryptionIv || !row.cookieEncryptionTag ||
    !row.encryptedApiToken || !row.apiTokenEncryptionIv || !row.apiTokenEncryptionTag
  ) {
    throw new Error("Shopee Partner credentials are unavailable");
  }
  return {
    cookies: decryptShopeeCookieJar({
      encryptedCookieJar: row.encryptedCookieJar,
      cookieEncryptionIv: row.cookieEncryptionIv,
      cookieEncryptionTag: row.cookieEncryptionTag,
    }),
    apiToken: decryptShopeePartnerApiToken({
      encryptedApiToken: row.encryptedApiToken,
      apiTokenEncryptionIv: row.apiTokenEncryptionIv,
      apiTokenEncryptionTag: row.apiTokenEncryptionTag,
    }),
  };
}

export async function revokeShopeePartnerSession(id: string, auditActor: string) {
  const normalizedActor = actor(auditActor);
  return prisma.shopeePartnerSession.update({
    where: { id },
    data: {
      status: "REVOKED",
      encryptedCookieJar: null,
      cookieEncryptionIv: null,
      cookieEncryptionTag: null,
      cookieFingerprint: null,
      encryptedApiToken: null,
      apiTokenEncryptionIv: null,
      apiTokenEncryptionTag: null,
      apiTokenFingerprint: null,
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
      pollWindowStartAt: null,
      pollCursor: null,
      revokedAt: new Date(),
      revokedBy: normalizedActor,
      updatedBy: normalizedActor,
    },
    select: viewSelect,
  });
}
