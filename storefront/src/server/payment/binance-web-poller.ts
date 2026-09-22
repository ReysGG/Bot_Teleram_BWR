import { integerEnv } from "@/server/env";
import {
  binanceWebCookieHeader,
  type BinanceWebCookie,
} from "@/server/payment/binance-web-cookie";
import {
  parseBinanceWebDetailResponse,
  parseBinanceWebAccountIdentityResponse,
  parseBinanceWebHistoryResponse,
  type BinanceWebDetail,
  type BinanceWebHistoryPage,
} from "@/server/payment/binance-web-contract";

export const BINANCE_WEB_HISTORY_URL = new URL(
  "https://www.binance.com/bapi/pay/v1/private/binance-pay/transaction/history-list",
);
export const BINANCE_WEB_DETAIL_URL = new URL(
  "https://www.binance.com/bapi/pay/v1/private/binance-pay/transaction/detail",
);
export const BINANCE_WEB_SELF_STATUS_URL = new URL(
  "https://www.binance.com/bapi/pay/v1/private/binance-pay/account/get-self-status",
);
export const BINANCE_WEB_ACCOUNT_URL = new URL(
  "https://www.binance.com/bapi/pay/v1/private/binance-pay/wallet/account/query",
);

const BINANCE_ORIGIN = "https://www.binance.com";
const BINANCE_HISTORY_REFERER = `${BINANCE_ORIGIN}/en/my/payment/history`;
const MAX_RESPONSE_BYTES = 1_000_000;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type PollFailureStatus =
  | "unauthorized"
  | "rate_limited"
  | "challenge"
  | "contract_unknown"
  | "response_too_large"
  | "upstream_error";

export type BinanceWebPollFailure = {
  status: PollFailureStatus;
  detail: string;
};

export type BinanceWebHistoryPollResult =
  | { status: "ok"; page: BinanceWebHistoryPage }
  | BinanceWebPollFailure;

export type BinanceWebDetailPollResult =
  | { status: "ok"; detail: BinanceWebDetail }
  | BinanceWebPollFailure;

export type BinanceWebAccountIdentityPollResult =
  | { status: "ok"; binanceId: string; rawPayloadHash: string }
  | BinanceWebPollFailure;

function csrfToken(cookies: readonly BinanceWebCookie[]): string | null {
  const found = cookies.find((cookie) => cookie.name.toLowerCase() === "csrftoken");
  return found?.value ?? null;
}

function headersFor(
  cookies: readonly BinanceWebCookie[],
  target: URL,
): Record<string, string> {
  const cookie = binanceWebCookieHeader(cookies, target);
  if (!cookie) return {};
  const csrf = csrfToken(cookies);
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/json",
    cookie,
    origin: BINANCE_ORIGIN,
    referer: BINANCE_HISTORY_REFERER,
    clienttype: "web",
    lang: "en",
    "user-agent": BROWSER_USER_AGENT,
    ...(csrf ? { csrftoken: csrf } : {}),
  };
}

async function readBoundedText(response: Response): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    return null;
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}

async function postJson(
  target: URL,
  cookies: readonly BinanceWebCookie[],
  body: unknown,
  fetchImpl: typeof fetch,
): Promise<{ status: "ok"; payload: unknown } | BinanceWebPollFailure> {
  const headers = headersFor(cookies, target);
  if (!headers.cookie) return { status: "unauthorized", detail: "NO_APPLICABLE_COOKIES" };
  let response: Response;
  try {
    response = await fetchImpl(target, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(
        Math.min(30_000, integerEnv("BINANCE_WEB_SESSION_POLL_TIMEOUT_MS", 12_000)),
      ),
    });
  } catch {
    return { status: "upstream_error", detail: "NETWORK_ERROR" };
  }

  if (response.status === 401 || response.status === 403) {
    return { status: "unauthorized", detail: `HTTP_${response.status}` };
  }
  if (response.status === 429) {
    return { status: "rate_limited", detail: "HTTP_429" };
  }
  if (
    (response.status >= 300 && response.status < 400) ||
    [409, 412, 418, 423].includes(response.status)
  ) {
    return { status: "challenge", detail: `HTTP_${response.status}` };
  }
  if (!response.ok) {
    return { status: "upstream_error", detail: `HTTP_${response.status}` };
  }

  const responseText = await readBoundedText(response);
  if (responseText === null) {
    return { status: "response_too_large", detail: "RESPONSE_LIMIT_EXCEEDED" };
  }
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("json")) {
    return contentType.includes("html")
      ? { status: "challenge", detail: "HTML_RESPONSE" }
      : { status: "contract_unknown", detail: "NON_JSON_RESPONSE" };
  }
  try {
    return { status: "ok", payload: JSON.parse(responseText) };
  } catch {
    return { status: "contract_unknown", detail: "INVALID_JSON_RESPONSE" };
  }
}

export function buildBinanceWebHistoryRequest(input: {
  startDate: Date;
  endDate: Date;
  lastTransactionTime?: bigint | null;
  pageSize?: number;
}) {
  const startDate = input.startDate.getTime();
  const endDate = input.endDate.getTime();
  if (
    !Number.isSafeInteger(startDate) ||
    !Number.isSafeInteger(endDate) ||
    startDate <= 0 ||
    endDate <= startDate
  ) {
    throw new Error("Invalid Binance history window");
  }
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error("Invalid Binance history page size");
  }
  const cursor = input.lastTransactionTime ?? 0n;
  if (cursor < 0n || cursor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Invalid Binance history cursor");
  }
  return {
    type: "INCOME",
    startDate,
    endDate,
    lastTransactionTime: Number(cursor),
    size: pageSize,
  } as const;
}

export async function pollBinanceWebHistory(
  input: {
    cookies: readonly BinanceWebCookie[];
    startDate: Date;
    endDate: Date;
    lastTransactionTime?: bigint | null;
    pageSize?: number;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BinanceWebHistoryPollResult> {
  const result = await postJson(
    BINANCE_WEB_HISTORY_URL,
    input.cookies,
    buildBinanceWebHistoryRequest(input),
    fetchImpl,
  );
  if (result.status !== "ok") return result;
  const parsed = parseBinanceWebHistoryResponse(result.payload);
  return parsed.status === "ok"
    ? parsed
    : { status: "contract_unknown", detail: parsed.detail };
}

export async function pollBinanceWebDetail(
  input: {
    cookies: readonly BinanceWebCookie[];
    providerTransactionId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<BinanceWebDetailPollResult> {
  const providerTransactionId = input.providerTransactionId.trim();
  if (!providerTransactionId || !/^[A-Za-z0-9._:-]{1,128}$/.test(providerTransactionId)) {
    throw new Error("Invalid Binance provider transaction ID");
  }
  const result = await postJson(
    BINANCE_WEB_DETAIL_URL,
    input.cookies,
    { id: providerTransactionId },
    fetchImpl,
  );
  if (result.status !== "ok") return result;
  const parsed = parseBinanceWebDetailResponse(result.payload);
  return parsed.status === "ok"
    ? parsed
    : { status: "contract_unknown", detail: parsed.detail };
}

export async function pollBinanceWebAccountIdentity(
  cookies: readonly BinanceWebCookie[],
  fetchImpl: typeof fetch = fetch,
): Promise<BinanceWebAccountIdentityPollResult> {
  let lastContractFailure: BinanceWebPollFailure = {
    status: "contract_unknown",
    detail: "ACCOUNT_IDENTITY_UNAVAILABLE",
  };
  for (const target of [BINANCE_WEB_SELF_STATUS_URL, BINANCE_WEB_ACCOUNT_URL]) {
    const result = await postJson(target, cookies, {}, fetchImpl);
    if (result.status !== "ok") {
      if (result.status === "unauthorized" || result.status === "challenge" || result.status === "rate_limited") {
        return result;
      }
      lastContractFailure = result;
      continue;
    }
    const parsed = parseBinanceWebAccountIdentityResponse(result.payload);
    if (parsed.status === "ok") return parsed;
    lastContractFailure = { status: "contract_unknown", detail: parsed.detail };
  }
  return lastContractFailure;
}
