import { sha256 } from "@/server/security/crypto";
import { parsePositiveUsdtMicros } from "@/server/payment/binance-internal-amount";
import {
  normalizeBinanceOrderIdValue,
} from "@/server/payment/binance-order-id";

const MAX_ID_LENGTH = 128;
const MAX_TEXT_LENGTH = 200;
const MAX_ROWS = 100;
const ALLOWED_DIRECTIONS = new Set(["INCOME", "PAYOUT"]);
const RELEVANT_TRANSACTION_TYPES = new Set(["C2C", "PAY"]);

export const BINANCE_WEB_INCOMING_DIRECTION = "INCOME" as const;
export const BINANCE_WEB_SUCCESS_STATUS = "SUCCESS" as const;

export function isCompletedIncomingUsdtTransaction(input: {
  direction: string;
  providerStatus: string;
  currency: string;
}) {
  return input.direction === BINANCE_WEB_INCOMING_DIRECTION &&
    input.providerStatus === BINANCE_WEB_SUCCESS_STATUS &&
    input.currency === "USDT";
}

type JsonRecord = Record<string, unknown>;

export type BinanceWebTransactionCandidate = {
  providerTransactionId: string;
  providerOrderId: string | null;
  transactionType: string | null;
  direction: string;
  providerStatus: string;
  providerStatusDetail: string | null;
  currency: string;
  amountMicros: bigint;
  counterpartyName: string | null;
  viaAccountValue: string | null;
  receiverBinanceId: string | null;
  occurredAt: Date;
  rawPayloadHash: string;
  detailPayloadHash: string | null;
};

export type BinanceWebHistoryPage = {
  transactions: BinanceWebTransactionCandidate[];
  hasMore: boolean;
  nextTransactionTime: bigint | null;
  skippedCount: number;
};

export type BinanceWebHistoryParseResult =
  | { status: "ok"; page: BinanceWebHistoryPage }
  | { status: "contract_unknown"; detail: string };

export type BinanceWebDetail = {
  providerTransactionId: string | null;
  providerOrderId: string;
  receiverBinanceId: string | null;
  amountMicros: bigint | null;
  currency: string | null;
  occurredAt: Date | null;
  rawPayloadHash: string;
};

export type BinanceWebDetailParseResult =
  | { status: "ok"; detail: BinanceWebDetail }
  | { status: "contract_unknown"; detail: string };

export type BinanceWebAccountIdentityParseResult =
  | { status: "ok"; binanceId: string; rawPayloadHash: string }
  | { status: "contract_unknown"; detail: string };

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function text(value: unknown, maxLength = MAX_TEXT_LENGTH): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    !normalized ||
    normalized.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

function enumText(value: unknown): string | null {
  const normalized = text(value, 64)?.toUpperCase() ?? null;
  return normalized && /^[A-Z0-9_:-]+$/.test(normalized) ? normalized : null;
}

function opaqueId(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : text(value, MAX_ID_LENGTH);
  return normalized && /^[A-Za-z0-9._:-]+$/.test(normalized)
    ? normalized
    : null;
}

function binanceId(value: unknown): string | null {
  const normalized =
    typeof value === "number" && Number.isSafeInteger(value)
      ? String(value)
      : text(value, 32);
  return normalized && /^\d{5,32}$/.test(normalized) ? normalized : null;
}

export function parseBinanceWebAccountIdentityResponse(
  input: unknown,
): BinanceWebAccountIdentityParseResult {
  const data = responseData(input);
  if (!data) return { status: "contract_unknown", detail: "INVALID_ACCOUNT_ENVELOPE" };
  const nested = [
    data,
    record(data.userInfo),
    record(data.account),
    record(data.data),
  ].filter((value): value is JsonRecord => Boolean(value));
  const candidates = nested.flatMap((value) => [
    value.binanceId,
    value.payId,
  ]);
  const identity = candidates.map(binanceId).find((value): value is string => Boolean(value));
  if (!identity) return { status: "contract_unknown", detail: "ACCOUNT_IDENTITY_MISSING" };
  return {
    status: "ok",
    binanceId: identity,
    rawPayloadHash: sha256(stableJson(data)),
  };
}

function epochMilliseconds(value: unknown): { value: bigint; date: Date } | null {
  const normalized =
    typeof value === "bigint"
      ? value.toString()
      : typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : typeof value === "string"
          ? value.trim()
          : "";
  if (!/^\d{12,17}$/.test(normalized)) return null;
  const milliseconds = BigInt(normalized);
  if (milliseconds > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const date = new Date(Number(milliseconds));
  return Number.isFinite(date.getTime()) ? { value: milliseconds, date } : null;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const object = value as JsonRecord;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function responseData(input: unknown): JsonRecord | null {
  const body = record(input);
  if (!body) return null;
  const code = typeof body.code === "number" ? String(body.code) : body.code;
  if (!new Set(["000000", "0"]).has(String(code)) || body.success !== true) return null;
  return record(body.data);
}

function nestedStatus(row: JsonRecord): { status: string | null; detail: string | null } {
  const transactionStatus = record(row.transactionStatus);
  return {
    status: enumText(row.status) ?? enumText(transactionStatus?.status),
    detail: enumText(row.statusDetail) ?? enumText(transactionStatus?.statusDetail),
  };
}

function receiverIdFromRecord(input: JsonRecord): string | null {
  const receiverInfo = record(input.receiverInfo);
  const payeeInfo = record(input.payeeInfo);
  const extensions = record(input.extensions);
  return binanceId(input.receiverBinanceId) ??
    binanceId(input.recipientBinanceId) ??
    binanceId(receiverInfo?.binanceId) ??
    binanceId(payeeInfo?.binanceId) ??
    binanceId(extensions?.receiverBinanceId) ??
    binanceId(extensions?.recipientBinanceId);
}

function amountFromRecord(input: JsonRecord): bigint | null {
  const transactionAmount = record(input.transactionAmount);
  return parsePositiveUsdtMicros(input.amount) ??
    parsePositiveUsdtMicros(transactionAmount?.amount) ??
    parsePositiveUsdtMicros(transactionAmount?.value);
}

function currencyFromRecord(input: JsonRecord): string | null {
  const transactionAmount = record(input.transactionAmount);
  const value = enumText(input.currency) ?? enumText(transactionAmount?.currency);
  return value && /^[A-Z0-9]{2,20}$/.test(value) ? value : null;
}

function orderIdFromRecord(input: JsonRecord): string | null {
  const raw = text(input.orderId, 148);
  if (!raw) return null;
  try {
    return normalizeBinanceOrderIdValue(raw);
  } catch {
    return null;
  }
}

function parseHistoryRow(raw: unknown):
  | { status: "ok"; transaction: BinanceWebTransactionCandidate }
  | { status: "skip" }
  | { status: "invalid" } {
  const row = record(raw);
  if (!row) return { status: "invalid" };

  const providerTransactionId = opaqueId(row.transactionId);
  const occurred = epochMilliseconds(row.transactionTime);
  const direction = enumText(row.type);
  const transactionType = enumText(row.transactionType);
  const status = nestedStatus(row);
  const amountMicros = amountFromRecord(row);
  const currency = currencyFromRecord(row);
  if (
    !providerTransactionId ||
    !occurred ||
    !direction ||
    !status.status ||
    !amountMicros ||
    !currency
  ) {
    return { status: "invalid" };
  }
  if (!ALLOWED_DIRECTIONS.has(direction)) return { status: "skip" };
  if (direction !== BINANCE_WEB_INCOMING_DIRECTION) return { status: "skip" };
  if (!transactionType || !RELEVANT_TRANSACTION_TYPES.has(transactionType)) {
    return { status: "skip" };
  }

  const context = record(row.transactionContext);
  return {
    status: "ok",
    transaction: {
      providerTransactionId,
      providerOrderId: orderIdFromRecord(row),
      transactionType,
      direction,
      providerStatus: status.status,
      providerStatusDetail: status.detail,
      currency,
      amountMicros,
      counterpartyName: text(row.counterpartyName),
      viaAccountValue: text(context?.viaAccountValue),
      receiverBinanceId: receiverIdFromRecord(row),
      occurredAt: occurred.date,
      rawPayloadHash: sha256(stableJson(row)),
      detailPayloadHash: null,
    },
  };
}

export function parseBinanceWebHistoryResponse(
  input: unknown,
): BinanceWebHistoryParseResult {
  const data = responseData(input);
  if (!data || !Array.isArray(data.transactionList) || data.transactionList.length > MAX_ROWS) {
    return { status: "contract_unknown", detail: "INVALID_HISTORY_ENVELOPE" };
  }
  if (typeof data.hasMore !== "boolean") {
    return { status: "contract_unknown", detail: "INVALID_HISTORY_PAGINATION" };
  }

  const transactions: BinanceWebTransactionCandidate[] = [];
  let skippedCount = 0;
  let finalTimestamp: bigint | null = null;
  for (const raw of data.transactionList) {
    const row = record(raw);
    const occurred = row ? epochMilliseconds(row.transactionTime) : null;
    if (!occurred) {
      return { status: "contract_unknown", detail: "INVALID_HISTORY_ROW" };
    }
    finalTimestamp = occurred.value;
    const parsed = parseHistoryRow(raw);
    if (parsed.status === "invalid") {
      return { status: "contract_unknown", detail: "INVALID_HISTORY_ROW" };
    }
    if (parsed.status === "skip") {
      skippedCount += 1;
      continue;
    }
    transactions.push(parsed.transaction);
  }

  if (data.hasMore && finalTimestamp === null) {
    return { status: "contract_unknown", detail: "MISSING_HISTORY_CURSOR" };
  }
  return {
    status: "ok",
    page: {
      transactions,
      hasMore: data.hasMore,
      nextTransactionTime: data.hasMore ? finalTimestamp : null,
      skippedCount,
    },
  };
}

export function parseBinanceWebDetailResponse(
  input: unknown,
): BinanceWebDetailParseResult {
  const data = responseData(input);
  if (!data) {
    return { status: "contract_unknown", detail: "INVALID_DETAIL_ENVELOPE" };
  }
  const providerOrderId = orderIdFromRecord(data);
  if (!providerOrderId) {
    return { status: "contract_unknown", detail: "DETAIL_ORDER_ID_MISSING" };
  }
  const time = epochMilliseconds(data.transactionTime);
  return {
    status: "ok",
    detail: {
      providerTransactionId: opaqueId(data.transactionId),
      providerOrderId,
      receiverBinanceId: receiverIdFromRecord(data),
      amountMicros: amountFromRecord(data),
      currency: currencyFromRecord(data),
      occurredAt: time?.date ?? null,
      rawPayloadHash: sha256(stableJson(data)),
    },
  };
}
