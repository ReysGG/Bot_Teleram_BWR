import { shopeeCookieHeader, type ShopeeCookie } from "@/server/payment/shopee-cookie";
import { normalizeShopeePartnerApiToken } from "@/server/payment/shopee-partner-credential";
import {
  parseShopeePartnerTransactionResponse,
  type ShopeePartnerAccountIdentity,
  type ShopeePartnerParsedPage,
} from "@/server/payment/shopee-partner-contract";

export const SHOPEE_PARTNER_TRANSACTIONS_URL = new URL(
  "https://shopeepay.shopee.co.id/merchant/v1/partner-web/get-transaction-list",
);
export const SHOPEE_PARTNER_MAX_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SHOPEE_PARTNER_DEFAULT_PAGE_SIZE = 50;
export const SHOPEE_PARTNER_MAX_PAGE_SIZE = 100;

const MAX_CURSOR_LENGTH = 512;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const SHOPEE_PARTNER_PORTAL_ORIGIN = "https://partner.shopee.co.id";
const SHOPEE_PARTNER_PORTAL_REFERER = `${SHOPEE_PARTNER_PORTAL_ORIGIN}/shopeepay-portal/transactions`;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";

export type ShopeePollResult =
  | { status: "unauthorized" | "rate_limited" | "challenge" | "response_too_large" | "upstream_error" | "contract_unknown" | "account_mismatch"; detail: string }
  | { status: "ok"; page: ShopeePartnerParsedPage };

export type ShopeePartnerPollInput = {
  cookies: readonly ShopeeCookie[];
  apiToken: string;
  startTime: Date;
  endTime: Date;
  nextPosition?: string;
  pageSize?: number;
  expectedAccount?: Pick<ShopeePartnerAccountIdentity, "merchantId" | "storeId" | "fingerprint">;
};

function unixSeconds(value: Date, field: string): number {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`${field} is invalid`);
  return Math.floor(timestamp / 1000);
}

export function buildShopeePartnerTransactionRequest(input: ShopeePartnerPollInput) {
  const startTime = unixSeconds(input.startTime, "startTime");
  const endTime = unixSeconds(input.endTime, "endTime");
  if (endTime <= startTime || (endTime - startTime) * 1000 > SHOPEE_PARTNER_MAX_WINDOW_MS) {
    throw new Error("Shopee Partner polling window is invalid");
  }
  const pageSize = input.pageSize ?? SHOPEE_PARTNER_DEFAULT_PAGE_SIZE;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > SHOPEE_PARTNER_MAX_PAGE_SIZE) {
    throw new Error("Shopee Partner page size is invalid");
  }
  const nextPosition = input.nextPosition?.trim() ?? "";
  if (nextPosition.length > MAX_CURSOR_LENGTH || /[\u0000-\u001f\u007f]/.test(nextPosition)) {
    throw new Error("Shopee Partner pagination cursor is invalid");
  }
  const metadataToken = normalizeShopeePartnerApiToken(input.apiToken);
  return {
    data: {
      metadata: {
        token: metadataToken,
        language: "id",
        timezone: "Asia/Jakarta",
      },
      pageSize,
      filter: {
        startTime,
        endTime,
        serviceList: [1, 3],
      },
      sorter: {
        field: "createTime",
        order: "descend",
      },
      next_position: nextPosition,
    },
  } as const;
}

async function readBoundedText(response: Response): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) return null;
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

export async function pollShopeePartnerTransactions(
  input: ShopeePartnerPollInput,
  fetchImpl: typeof fetch = fetch,
): Promise<ShopeePollResult> {
  const body = JSON.stringify(buildShopeePartnerTransactionRequest(input));
  const cookie = shopeeCookieHeader(input.cookies, SHOPEE_PARTNER_TRANSACTIONS_URL);
  if (!cookie) return { status: "unauthorized", detail: "NO_APPLICABLE_COOKIES" };
  let response: Response;
  try {
    response = await fetchImpl(SHOPEE_PARTNER_TRANSACTIONS_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
        "content-type": "application/json",
        cookie,
        origin: SHOPEE_PARTNER_PORTAL_ORIGIN,
        referer: SHOPEE_PARTNER_PORTAL_REFERER,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        "user-agent": BROWSER_USER_AGENT,
        "x-token": "",
        "x-timestamp-ms": String(Date.now()),
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { status: "upstream_error", detail: "NETWORK_ERROR" };
  }
  if (response.status === 401 || response.status === 403) {
    return { status: "unauthorized", detail: `HTTP ${response.status}` };
  }
  if (response.status === 429) return { status: "rate_limited", detail: "HTTP 429" };
  if (response.status >= 300 && response.status < 400) {
    return { status: "challenge", detail: `HTTP ${response.status}` };
  }
  if ([409, 412, 418, 423].includes(response.status)) {
    return { status: "challenge", detail: `HTTP ${response.status}` };
  }
  if (!response.ok) return { status: "upstream_error", detail: `HTTP ${response.status}` };

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
    JSON.parse(responseText);
  } catch {
    return { status: "contract_unknown", detail: "INVALID_JSON_RESPONSE" };
  }

  const parsed = parseShopeePartnerTransactionResponse(JSON.parse(responseText), input.expectedAccount);
  if (parsed.status === "ok") return parsed;
  return parsed;
}
