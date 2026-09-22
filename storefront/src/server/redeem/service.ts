import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { integerEnv } from "@/server/env";
import { safeEqual } from "@/server/security/crypto";
import {
  accountEmailHash,
  decryptAccountLoginCredential,
  normalizeAccountEmail,
  serializeAccountLogin,
} from "@/server/redeem/account-login";
import { detectStockContent, parseCredentialJson } from "@/server/stock/credential";
import { decryptStockItem } from "@/server/stock/inventory";

// Keep the request bounded by the 5 MB JSON guard, while allowing real bulk claims.
export const MAX_REDEEM_ITEMS = integerEnv("ACCOUNT_REDEEM_MAX_ITEMS", 2_000);

export type RedeemUploadIdentity = {
  email: string;
  fingerprint: string;
  accessToken: string;
  refreshToken: string | null;
};

export type RedeemUploadParseResult = {
  credentials: RedeemUploadIdentity[];
  invalid: number;
  duplicates: number;
};

export type PendingRedeemBatch = {
  kind: "ACCOUNT_REDEEM";
  batchId: string;
  messageId: number;
  stockItemIds: string[];
  inputCount: number;
  unmatchedCount: number;
  invalidCount: number;
  duplicateCount: number;
};

type OwnedDeliveredStock = {
  id: string;
  deliveredAt: Date | null;
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
  credentialFingerprint: string;
  deliveredOrderId: string | null;
  orderItem: { orderId: string; order: { chatId: string } } | null;
  deliveryReceipt: { chatId: string; status: string } | null;
};

function jsonItems(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

export function parseRedeemJson(content: Buffer): RedeemUploadParseResult {
  if (content.byteLength === 0 || content.byteLength > 5 * 1024 * 1024) {
    throw new Error("File JSON harus berukuran 1 byte sampai 5 MB.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(content));
  } catch {
    throw new Error("File bukan JSON UTF-8 yang valid.");
  }
  const items = jsonItems(parsed);
  if (items.length === 0 || items.length > MAX_REDEEM_ITEMS) {
    throw new Error(`Satu file harus berisi 1-${MAX_REDEEM_ITEMS} akun.`);
  }

  const credentials: RedeemUploadIdentity[] = [];
  const seen = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  for (const item of items) {
    try {
      const parsedCredential = parseCredentialJson(JSON.stringify(item));
      const email = normalizeAccountEmail(parsedCredential.credential.email ?? "");
      if (!email) {
        invalid += 1;
        continue;
      }
      const identityKey = `${parsedCredential.fingerprint}:${email}`;
      if (seen.has(identityKey)) {
        duplicates += 1;
        continue;
      }
      seen.add(identityKey);
      credentials.push({
        email,
        fingerprint: parsedCredential.fingerprint,
        accessToken: parsedCredential.credential.accessToken,
        refreshToken: parsedCredential.credential.refreshToken ?? null,
      });
    } catch {
      invalid += 1;
    }
  }
  return { credentials, invalid, duplicates };
}

export function newPendingRedeemBatch(messageId: number): PendingRedeemBatch {
  return {
    kind: "ACCOUNT_REDEEM",
    batchId: randomUUID(),
    messageId,
    stockItemIds: [],
    inputCount: 0,
    unmatchedCount: 0,
    invalidCount: 0,
    duplicateCount: 0,
  };
}

export function parsePendingRedeemBatch(value: Prisma.JsonValue | null): PendingRedeemBatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, Prisma.JsonValue>;
  if (
    record.kind !== "ACCOUNT_REDEEM" ||
    typeof record.batchId !== "string" ||
    typeof record.messageId !== "number" ||
    !Array.isArray(record.stockItemIds) ||
    !record.stockItemIds.every((id) => typeof id === "string")
  ) {
    return null;
  }
  return {
    kind: "ACCOUNT_REDEEM",
    batchId: record.batchId,
    messageId: record.messageId,
    stockItemIds: record.stockItemIds as string[],
    inputCount: typeof record.inputCount === "number" ? record.inputCount : 0,
    unmatchedCount: typeof record.unmatchedCount === "number" ? record.unmatchedCount : 0,
    invalidCount: typeof record.invalidCount === "number" ? record.invalidCount : 0,
    duplicateCount: typeof record.duplicateCount === "number" ? record.duplicateCount : 0,
  };
}

function stockIdentity(stock: OwnedDeliveredStock) {
  try {
    const parsed = detectStockContent(decryptStockItem(stock));
    if (parsed.kind !== "K12") return null;
    const email = normalizeAccountEmail(parsed.credential.email ?? "");
    if (!email || !stock.orderItem) return null;
    if (stock.deliveredOrderId !== stock.orderItem.orderId) return null;
    if (
      stock.deliveryReceipt &&
      (stock.deliveryReceipt.status !== "SENT" ||
        stock.deliveryReceipt.chatId !== stock.orderItem.order.chatId)
    ) {
      return null;
    }
    return {
      stockItemId: stock.id,
      orderId: stock.orderItem.orderId,
      email,
      fingerprint: parsed.fingerprint,
      accessToken: parsed.credential.accessToken,
      refreshToken: parsed.credential.refreshToken ?? null,
      deliveredAt: stock.deliveredAt?.getTime() ?? 0,
    };
  } catch {
    return null;
  }
}

async function ownedDeliveredStocks(chatId: string) {
  return prisma.digitalStockItem.findMany({
    where: {
      status: "DELIVERED",
      orderItem: { is: { order: { chatId } } },
    },
    select: {
      id: true,
      deliveredAt: true,
      encryptedPayload: true,
      encryptionIv: true,
      encryptionTag: true,
      credentialFingerprint: true,
      deliveredOrderId: true,
      orderItem: {
        select: { orderId: true, order: { select: { chatId: true } } },
      },
      deliveryReceipt: { select: { chatId: true, status: true } },
    },
    orderBy: { deliveredAt: "desc" },
    take: 2_000,
  });
}

export async function addRedeemUpload(input: {
  chatId: string;
  pending: PendingRedeemBatch;
  parsed: RedeemUploadParseResult;
}) {
  const remaining = MAX_REDEEM_ITEMS - input.pending.inputCount;
  if (remaining <= 0) throw new Error(`Maksimal ${MAX_REDEEM_ITEMS} akun per proses.`);
  const uploadCount = input.parsed.credentials.length + input.parsed.invalid;
  if (uploadCount > remaining) {
    throw new Error(`Total batch maksimal ${MAX_REDEEM_ITEMS} akun.`);
  }
  const uploadCredentials = input.parsed.credentials;
  const stocks = await ownedDeliveredStocks(input.chatId);
  const identities = stocks
    .map(stockIdentity)
    .filter((value): value is NonNullable<ReturnType<typeof stockIdentity>> => Boolean(value))
    .sort(
      (left, right) =>
        input.pending.stockItemIds.indexOf(left.stockItemId) -
        input.pending.stockItemIds.indexOf(right.stockItemId),
    );
  const byFingerprint = new Map<string, Array<typeof identities[number]>>();
  const byEmail = new Map<string, Array<typeof identities[number]>>();
  for (const identity of identities) {
    byFingerprint.set(identity.fingerprint, [
      ...(byFingerprint.get(identity.fingerprint) ?? []),
      identity,
    ]);
    byEmail.set(identity.email, [...(byEmail.get(identity.email) ?? []), identity]);
  }

  const selected = new Set(input.pending.stockItemIds);
  let matched = 0;
  let unmatched = 0;
  let duplicates = input.parsed.duplicates;
  for (const credential of uploadCredentials) {
    const candidates = [
      ...(byFingerprint.get(credential.fingerprint) ?? []),
      ...(byEmail.get(credential.email) ?? []),
    ].filter(
      (candidate, index, values) =>
        values.findIndex((value) => value.stockItemId === candidate.stockItemId) === index,
    );
    const stock = candidates.find((candidate) => {
      if (safeEqual(candidate.accessToken, credential.accessToken)) return true;
      return Boolean(
        candidate.refreshToken &&
        credential.refreshToken &&
        safeEqual(candidate.refreshToken, credential.refreshToken),
      );
    });
    if (!stock) {
      unmatched += 1;
      continue;
    }
    if (selected.has(stock.stockItemId)) {
      duplicates += 1;
      continue;
    }
    selected.add(stock.stockItemId);
    matched += 1;
  }

  return {
    pending: {
      ...input.pending,
      stockItemIds: [...selected],
      inputCount: input.pending.inputCount + input.parsed.credentials.length + input.parsed.invalid,
      unmatchedCount: input.pending.unmatchedCount + unmatched,
      invalidCount: input.pending.invalidCount + input.parsed.invalid,
      duplicateCount: input.pending.duplicateCount + duplicates,
    } satisfies PendingRedeemBatch,
    matched,
    unmatched,
  };
}

export async function prepareRedeemOutput(input: {
  chatId: string;
  pending: PendingRedeemBatch;
}) {
  const stocks = await prisma.digitalStockItem.findMany({
    where: {
      id: { in: input.pending.stockItemIds },
      status: "DELIVERED",
      orderItem: { is: { order: { chatId: input.chatId } } },
    },
    select: {
      id: true,
      deliveredAt: true,
      encryptedPayload: true,
      encryptionIv: true,
      encryptionTag: true,
      credentialFingerprint: true,
      deliveredOrderId: true,
      orderItem: {
        select: { orderId: true, order: { select: { chatId: true } } },
      },
      deliveryReceipt: { select: { chatId: true, status: true } },
    },
  });
  const identities = stocks
    .map(stockIdentity)
    .filter((value): value is NonNullable<ReturnType<typeof stockIdentity>> => Boolean(value));
  const emailHashes = identities.map((identity) => accountEmailHash(identity.email));
  const loginCredentials = await prisma.accountLoginCredential.findMany({
    where: { emailHash: { in: emailHashes } },
  });
  const byEmailHash = new Map(loginCredentials.map((row) => [row.emailHash, row]));
  const missing = identities.flatMap((identity) =>
    byEmailHash.has(accountEmailHash(identity.email))
      ? []
      : [{ stockItemId: identity.stockItemId, orderId: identity.orderId }],
  );
  const units = identities.flatMap((identity) => {
    const login = byEmailHash.get(accountEmailHash(identity.email));
    if (!login) return [];
    const payload = decryptAccountLoginCredential(login);
    return [{
      stockItemId: identity.stockItemId,
      orderId: identity.orderId,
      loginCredentialId: login.id,
      line: serializeAccountLogin(payload),
    }];
  });
  return {
    units,
    content: Buffer.from(`${units.map((unit) => unit.line).join("\n")}\n`, "utf8"),
    missingMappings: missing.length,
    missing,
  };
}

export function redeemOutputFilename(quantity: number, now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `BWR-${stamp}-${quantity}-account-login.txt`;
}

export async function claimRedeemBatch(input: {
  pending: PendingRedeemBatch;
  chatId: string;
  matchedCount: number;
}) {
  try {
    return await prisma.accountRedeemBatch.create({
      data: {
        id: input.pending.batchId,
        chatId: input.chatId,
        inputCount: input.pending.inputCount,
        matchedCount: input.matchedCount,
        unmatchedCount: input.pending.unmatchedCount,
        invalidCount: input.pending.invalidCount,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return null;
    }
    throw error;
  }
}

export async function markRedeemBatchSent(input: {
  batchId: string;
  chatId: string;
  telegramMessageId: number;
  units: Array<{ stockItemId: string; orderId: string; loginCredentialId: string }>;
}) {
  await prisma.$transaction([
    prisma.accountRedeemBatch.update({
      where: { id: input.batchId },
      data: {
        status: "SENT",
        telegramMessageId: String(input.telegramMessageId),
        sentAt: new Date(),
        lastError: null,
      },
    }),
    prisma.accountRedeemEvent.createMany({
      data: input.units.map((unit, position) => ({
        batchId: input.batchId,
        chatId: input.chatId,
        stockItemId: unit.stockItemId,
        orderId: unit.orderId,
        loginCredentialId: unit.loginCredentialId,
        position,
      })),
      skipDuplicates: true,
    }),
  ]);
}

export async function markRedeemBatchFailed(input: {
  batchId: string;
  ambiguous: boolean;
  error: string;
}) {
  await prisma.accountRedeemBatch.updateMany({
    where: { id: input.batchId, status: "PROCESSING" },
    data: {
      status: input.ambiguous ? "UNKNOWN" : "FAILED",
      lastError: input.error.slice(0, 500),
    },
  });
}
