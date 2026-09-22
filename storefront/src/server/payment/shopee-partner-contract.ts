import { sha256 } from "@/server/security/crypto";

export const SHOPEE_COMPLETED_STATUS = 3;
export const SHOPEE_INCOMING_TRANSACTION_TYPE = 1;
export const SHOPEE_TRANSACTION_SERVICES = [1, 3] as const;

const MAX_TRANSACTION_ID_LENGTH = 128;
const MAX_MERCHANT_ID_LENGTH = 64;
const MAX_CURSOR_LENGTH = 512;

export type ShopeePartnerAccountIdentity = {
  merchantId: string;
  storeId: string;
  fingerprint: string;
};

export type ShopeePartnerTransactionCandidate = {
  // Shopee's numeric transactionId is the stable provider key. The alphanumeric
  // externalTransactionId is retained separately for audit and reconciliation.
  externalTransactionId: string;
  merchantExternalTransactionId: string;
  merchantAccountFingerprint: string;
  merchantId: string;
  storeId: string;
  service: number;
  transactionType: number;
  statusCode: number;
  amount: number;
  occurredAt: Date;
  rawPayloadHash: string;
};

export type ShopeePartnerParsedPage = {
  account: ShopeePartnerAccountIdentity;
  transactions: ShopeePartnerTransactionCandidate[];
  nextPosition: string;
  skippedCount: number;
};

export type ShopeePartnerResponseParseResult =
  | { status: "ok"; page: ShopeePartnerParsedPage }
  | { status: "contract_unknown" | "account_mismatch"; detail: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function decimalIdentifier(value: unknown, maxLength: number): string | null {
  const normalized = typeof value === "number"
    ? (Number.isSafeInteger(value) ? String(value) : "")
    : typeof value === "string"
      ? value.trim()
      : "";
  if (!normalized || normalized.length > maxLength || !/^\d+$/.test(normalized)) return null;
  return normalized;
}

function opaqueIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > MAX_TRANSACTION_ID_LENGTH || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

function nonNegativeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseShopeeIdrAmount(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized) && !/^\d{1,3}(?:\.\d{3})+$/.test(normalized)) return null;
  const amount = Number(normalized.replaceAll(".", ""));
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function epochSeconds(value: unknown): Date | null {
  const seconds = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date : null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

export function shopeePartnerAccountFingerprint(merchantId: string, storeId: string): string {
  return sha256(`shopee-partner-account:v1:${merchantId}:${storeId}`);
}

function accountFromRow(row: Record<string, unknown>): ShopeePartnerAccountIdentity | null {
  const merchantId = decimalIdentifier(row.merchantId, MAX_MERCHANT_ID_LENGTH);
  const storeId = decimalIdentifier(row.storeId, MAX_MERCHANT_ID_LENGTH);
  if (!merchantId || !storeId) return null;
  return {
    merchantId,
    storeId,
    fingerprint: shopeePartnerAccountFingerprint(merchantId, storeId),
  };
}

export function parseShopeePartnerTransactionResponse(
  input: unknown,
  expectedAccount?: Pick<ShopeePartnerAccountIdentity, "merchantId" | "storeId" | "fingerprint">,
): ShopeePartnerResponseParseResult {
  const body = record(input);
  const data = record(body?.data);
  if (body?.code !== 0 || !data) {
    return { status: "contract_unknown", detail: "INVALID_TRANSACTION_LIST_ENVELOPE" };
  }

  // Shopee omits `list` when a valid query has no rows. An already validated
  // session can safely treat that shape as an empty page; a new session still
  // needs a row to establish its merchant/store identity.
  const rawList = data.list;
  if (rawList !== undefined && rawList !== null && !Array.isArray(rawList)) {
    return { status: "contract_unknown", detail: "INVALID_TRANSACTION_LIST_ENVELOPE" };
  }
  if (!Array.isArray(rawList) && !expectedAccount) {
    return { status: "contract_unknown", detail: "ACCOUNT_IDENTITY_NOT_FOUND" };
  }

  const rawCursor = data.next_position;
  const nextPosition = rawCursor === undefined || rawCursor === null
    ? ""
    : typeof rawCursor === "string" ? rawCursor.trim() : null;
  if (nextPosition === null || nextPosition.length > MAX_CURSOR_LENGTH || /[\u0000-\u001f\u007f]/.test(nextPosition)) {
    return { status: "contract_unknown", detail: "INVALID_TRANSACTION_CURSOR" };
  }

  let account: ShopeePartnerAccountIdentity | null = null;
  const transactions: ShopeePartnerTransactionCandidate[] = [];
  let skippedCount = 0;
  for (const raw of rawList ?? []) {
    const row = record(raw);
    if (!row) return { status: "contract_unknown", detail: "INVALID_TRANSACTION_ROW" };
    const rowAccount = accountFromRow(row);
    const transactionId = opaqueIdentifier(row.transactionId);
    const merchantExternalTransactionId = opaqueIdentifier(row.externalTransactionId);
    const amount = parseShopeeIdrAmount(row.amount);
    const occurredAt = epochSeconds(row.createTime);
    const service = nonNegativeInteger(row.service);
    const transactionType = nonNegativeInteger(row.transactionType);
    const statusCode = nonNegativeInteger(row.status);
    if (!rowAccount || !transactionId || !merchantExternalTransactionId || !amount || !occurredAt || service === null || transactionType === null || statusCode === null) {
      return { status: "contract_unknown", detail: "INVALID_TRANSACTION_ROW" };
    }
    if (account && (account.merchantId !== rowAccount.merchantId || account.storeId !== rowAccount.storeId)) {
      return { status: "account_mismatch", detail: "MULTIPLE_MERCHANT_IDENTITIES" };
    }
    account = rowAccount;
    if (expectedAccount && (
      expectedAccount.merchantId !== rowAccount.merchantId ||
      expectedAccount.storeId !== rowAccount.storeId ||
      expectedAccount.fingerprint !== rowAccount.fingerprint
    )) {
      return { status: "account_mismatch", detail: "SESSION_MERCHANT_IDENTITY_CHANGED" };
    }

    if (
      statusCode !== SHOPEE_COMPLETED_STATUS ||
      transactionType !== SHOPEE_INCOMING_TRANSACTION_TYPE ||
      !SHOPEE_TRANSACTION_SERVICES.includes(service as (typeof SHOPEE_TRANSACTION_SERVICES)[number])
    ) {
      skippedCount += 1;
      continue;
    }
    transactions.push({
      externalTransactionId: transactionId,
      merchantExternalTransactionId,
      merchantAccountFingerprint: rowAccount.fingerprint,
      merchantId: rowAccount.merchantId,
      storeId: rowAccount.storeId,
      service,
      transactionType,
      statusCode,
      amount,
      occurredAt,
      rawPayloadHash: sha256(stableJson(row)),
    });
  }

  if (!account && expectedAccount) account = { ...expectedAccount };
  if (!account) return { status: "contract_unknown", detail: "ACCOUNT_IDENTITY_NOT_FOUND" };
  return {
    status: "ok",
    page: { account, transactions, nextPosition, skippedCount },
  };
}
