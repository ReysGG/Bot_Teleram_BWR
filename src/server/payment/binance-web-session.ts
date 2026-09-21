import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  binanceWebCookieFingerprint,
  decryptBinanceWebCookieJar,
  encryptBinanceWebCookieJar,
  parseBinanceWebCookieExport,
  type BinanceWebCookie,
} from "@/server/payment/binance-web-cookie";
import { normalizeBinanceRecipientId } from "@/server/payment/binance-internal-setting";
import { sha256 } from "@/server/security/crypto";
import { optionalEnv } from "@/server/env";

function auditActor(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160) throw new Error("Invalid audit actor");
  return normalized;
}

export function binanceWebAccountFingerprint(recipientBinanceId: string): string {
  return sha256(
    `binance-web-recipient:v1:${normalizeBinanceRecipientId(recipientBinanceId)}`,
  );
}

export function classifyBinanceWebAccountProof(input: {
  expectedRecipientBinanceId: string;
  storedAccountFingerprint?: string | null;
  sessionStatus: string;
  observedReceiverBinanceIds: readonly string[];
}): "PROVEN" | "UNPROVEN" | "MISMATCH" {
  const expectedRecipient = normalizeBinanceRecipientId(
    input.expectedRecipientBinanceId,
  );
  const expectedFingerprint = binanceWebAccountFingerprint(expectedRecipient);
  const observed = new Set(input.observedReceiverBinanceIds);
  if ([...observed].some((value) => value !== expectedRecipient)) {
    return "MISMATCH";
  }
  if (
    input.sessionStatus === "ACTIVE" &&
    input.storedAccountFingerprint === expectedFingerprint
  ) {
    return "PROVEN";
  }
  return observed.has(expectedRecipient) ? "PROVEN" : "UNPROVEN";
}

export type BinanceWebSessionView = {
  id: string;
  name: string;
  cookieFingerprint: string | null;
  recipientBinanceId: string | null;
  accountFingerprint: string | null;
  status: string;
  isPrimary: boolean;
  lastValidatedAt: Date | null;
  lastSuccessfulPollAt: Date | null;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
  activatedAt: Date | null;
  activatedBy: string | null;
  revokedAt: Date | null;
  revokedBy: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
};

const viewSelect = {
  id: true,
  name: true,
  cookieFingerprint: true,
  recipientBinanceId: true,
  accountFingerprint: true,
  status: true,
  isPrimary: true,
  lastValidatedAt: true,
  lastSuccessfulPollAt: true,
  lastErrorCode: true,
  lastErrorAt: true,
  activatedAt: true,
  activatedBy: true,
  revokedAt: true,
  revokedBy: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createBinanceWebSession(input: {
  name: string;
  cookieExport: unknown;
  recipientBinanceId: string;
  actor: string;
}): Promise<BinanceWebSessionView> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) {
    throw new Error("Invalid Binance web session name");
  }
  const recipientBinanceId = normalizeBinanceRecipientId(
    input.recipientBinanceId,
  );
  const cookies = parseBinanceWebCookieExport(input.cookieExport);
  const encrypted = encryptBinanceWebCookieJar(cookies);
  const actor = auditActor(input.actor);
  return prisma.binanceWebSession.create({
    data: {
      name,
      encryptedCookieJar: encrypted.encryptedPayload,
      cookieEncryptionIv: encrypted.encryptionIv,
      cookieEncryptionTag: encrypted.encryptionTag,
      cookieFingerprint: binanceWebCookieFingerprint(cookies),
      recipientBinanceId,
      status: "PENDING_VALIDATION",
      createdBy: actor,
      updatedBy: actor,
    },
    select: viewSelect,
  });
}

export async function listBinanceWebSessions(): Promise<BinanceWebSessionView[]> {
  return prisma.binanceWebSession.findMany({
    select: viewSelect,
    orderBy: [{ isPrimary: "desc" }, { status: "asc" }, { updatedAt: "desc" }],
  });
}

export async function readBinanceWebSessionCredentials(
  id: string,
  pollingLeaseToken?: string,
): Promise<{ cookies: BinanceWebCookie[] }> {
  const row = await prisma.binanceWebSession.findFirstOrThrow({
    where: {
      id,
      status: { in: ["PENDING_VALIDATION", "ACTIVE"] },
      ...(pollingLeaseToken ? { pollingLeaseToken } : {}),
    },
    select: {
      encryptedCookieJar: true,
      cookieEncryptionIv: true,
      cookieEncryptionTag: true,
    },
  });
  if (
    !row.encryptedCookieJar ||
    !row.cookieEncryptionIv ||
    !row.cookieEncryptionTag
  ) {
    throw new Error("Binance web credentials are unavailable");
  }
  return {
    cookies: decryptBinanceWebCookieJar({
      encryptedCookieJar: row.encryptedCookieJar,
      cookieEncryptionIv: row.cookieEncryptionIv,
      cookieEncryptionTag: row.cookieEncryptionTag,
    }),
  };
}

type SessionTransactionClient = Pick<
  Prisma.TransactionClient,
  "$executeRaw" | "binanceWebSession" | "storeRuntimeSetting"
>;

export async function markBinanceWebSessionValidated(input: {
  id: string;
  provenRecipientBinanceId: string;
  actor?: string;
  now?: Date;
}) {
  const recipientBinanceId = normalizeBinanceRecipientId(
    input.provenRecipientBinanceId,
  );
  const accountFingerprint = binanceWebAccountFingerprint(recipientBinanceId);
  const now = input.now ?? new Date();
  const actor = auditActor(input.actor ?? "system:binance-web-validation");
  return prisma.$transaction(async (tx: SessionTransactionClient) => {
    const current = await tx.binanceWebSession.findUniqueOrThrow({
      where: { id: input.id },
      select: {
        recipientBinanceId: true,
        status: true,
        encryptedCookieJar: true,
      },
    });
    if (current.status === "REVOKED" || !current.encryptedCookieJar) {
      throw new Error("Binance web session is revoked");
    }
    if (current.recipientBinanceId !== recipientBinanceId) {
      throw new Error("Binance web session recipient mismatch");
    }
    return tx.binanceWebSession.update({
      where: { id: input.id },
      data: {
        status: "ACTIVE",
        accountFingerprint,
        lastValidatedAt: now,
        lastErrorCode: null,
        lastErrorAt: null,
        updatedBy: actor,
      },
      select: viewSelect,
    });
  });
}

export async function selectPrimaryBinanceWebSession(input: {
  id: string;
  actor: string;
  now?: Date;
}) {
  const actor = auditActor(input.actor);
  const now = input.now ?? new Date();
  return prisma.$transaction(async (tx: SessionTransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('telegram_binance_web_primary_session'))`;
    const session = await tx.binanceWebSession.findUniqueOrThrow({
      where: { id: input.id },
      select: {
        id: true,
        status: true,
        recipientBinanceId: true,
        accountFingerprint: true,
        encryptedCookieJar: true,
      },
    });
    const setting = await tx.storeRuntimeSetting.findUnique({
      where: { id: "global" },
      select: { binanceInternalRecipientId: true },
    });
    if (
      session.status !== "ACTIVE" ||
      !session.recipientBinanceId ||
      !session.accountFingerprint ||
      !session.encryptedCookieJar
    ) {
      throw new Error("Binance web session is not validated");
    }
    const configuredRecipient = setting?.binanceInternalRecipientId ??
      (optionalEnv("BINANCE_PAY_RECIPIENT_ID")
        ? normalizeBinanceRecipientId(optionalEnv("BINANCE_PAY_RECIPIENT_ID"))
        : null);
    if (configuredRecipient !== session.recipientBinanceId) {
      throw new Error("Binance web session does not match the configured recipient");
    }
    await tx.binanceWebSession.updateMany({
      where: { isPrimary: true, id: { not: session.id } },
      data: { isPrimary: false, updatedBy: actor },
    });
    return tx.binanceWebSession.update({
      where: { id: session.id },
      data: {
        isPrimary: true,
        activatedAt: now,
        activatedBy: actor,
        updatedBy: actor,
      },
      select: viewSelect,
    });
  });
}

export async function prepareBinanceWebSessionValidation(input: {
  id: string;
  actor: string;
}) {
  const actor = auditActor(input.actor);
  const current = await prisma.binanceWebSession.findUniqueOrThrow({
    where: { id: input.id },
    select: { status: true, isPrimary: true, encryptedCookieJar: true },
  });
  if (current.status === "REVOKED" || !current.encryptedCookieJar) {
    throw new Error("Binance web session is revoked");
  }
  return prisma.binanceWebSession.update({
    where: { id: input.id },
    data: {
      status: current.status === "ACTIVE" ? "ACTIVE" : "PENDING_VALIDATION",
      isPrimary: current.status === "ACTIVE" ? current.isPrimary : false,
      lastErrorCode: null,
      lastErrorAt: null,
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
      updatedBy: actor,
    },
    select: viewSelect,
  });
}

export async function revokeBinanceWebSession(
  id: string,
  actorValue: string,
) {
  const actor = auditActor(actorValue);
  const now = new Date();
  return prisma.binanceWebSession.update({
    where: { id },
    data: {
      status: "REVOKED",
      isPrimary: false,
      encryptedCookieJar: null,
      cookieEncryptionIv: null,
      cookieEncryptionTag: null,
      cookieFingerprint: null,
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
      pollCursorTime: null,
      revokedAt: now,
      revokedBy: actor,
      updatedBy: actor,
    },
    select: viewSelect,
  });
}

export async function getPrimaryBinanceWebSession(
  recipientBinanceId?: string | null,
) {
  const recipient = recipientBinanceId
    ? normalizeBinanceRecipientId(recipientBinanceId)
    : undefined;
  return prisma.binanceWebSession.findFirst({
    where: {
      status: "ACTIVE",
      isPrimary: true,
      encryptedCookieJar: { not: null },
      accountFingerprint: { not: null },
      ...(recipient ? { recipientBinanceId: recipient } : {}),
    },
    select: {
      id: true,
      name: true,
      recipientBinanceId: true,
      accountFingerprint: true,
      lastValidatedAt: true,
      lastSuccessfulPollAt: true,
    },
  });
}

export async function listBinanceWebTransactions(input: {
  status?: "RECEIVED" | "MATCHED" | "CONFIRMED" | "UNMATCHED" | "AMBIGUOUS" | "REJECTED";
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(input.pageSize ?? 20)));
  const search = input.search?.trim().slice(0, 128);
  const where = {
    ...(input.status ? { status: input.status } : {}),
    ...(search
      ? {
          OR: [
            { providerTransactionId: { contains: search, mode: "insensitive" as const } },
            { providerOrderId: { contains: search, mode: "insensitive" as const } },
            { counterpartyName: { contains: search, mode: "insensitive" as const } },
            { binanceInternalPaymentAttempt: { order: { invoiceNumber: { contains: search, mode: "insensitive" as const } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.binanceWebTransaction.findMany({
      where,
      include: {
        session: { select: { name: true, cookieFingerprint: true } },
        binanceInternalPaymentAttempt: {
          select: { order: { select: { id: true, invoiceNumber: true } } },
        },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.binanceWebTransaction.count({ where }),
  ]);
  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
