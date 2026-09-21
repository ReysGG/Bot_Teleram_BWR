import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptShopeeCookieJar,
  encryptShopeeCookieJar,
  parseShopeeCookieExport,
  shopeeCookieFingerprint,
  shopeeCookieHeader,
} from "@/server/payment/shopee-cookie";
import {
  SHOPEE_PARTNER_TRANSACTIONS_URL,
  buildShopeePartnerTransactionRequest,
  pollShopeePartnerTransactions,
} from "@/server/payment/shopee-partner-poller";
import {
  decryptShopeePartnerApiToken,
  encryptShopeePartnerApiToken,
  shopeePartnerApiTokenFingerprint,
} from "@/server/payment/shopee-partner-credential";

const cookie = {
  domain: ".shopee.co.id",
  expirationDate: 2_000_000_000,
  httpOnly: true,
  name: "SPC_T_ID",
  path: "/",
  secure: true,
  value: "redacted-session-value",
};

describe("Shopee Partner cookie handling", () => {
  beforeEach(() => {
    process.env.PAYMENT_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  });

  it("accepts only Shopee domains and drops expired entries", () => {
    const parsed = parseShopeeCookieExport([
      cookie,
      { ...cookie, name: "expired", expirationDate: 1 },
    ], 1_000_000);
    expect(parsed).toHaveLength(1);
    expect(shopeeCookieHeader(parsed, SHOPEE_PARTNER_TRANSACTIONS_URL)).toContain("SPC_T_ID=redacted-session-value");
  });

  it("rejects cookies from another domain", () => {
    expect(() => parseShopeeCookieExport([{ ...cookie, domain: ".example.com" }]))
      .toThrow("shopee.co.id");
  });

  it("rejects duplicate cookie keys instead of sending an ambiguous jar", () => {
    expect(() => parseShopeeCookieExport([cookie, { ...cookie }]))
      .toThrow("duplikat");
  });

  it("encrypts the cookie jar and round-trips without exposing plaintext", () => {
    const parsed = parseShopeeCookieExport([cookie]);
    const encrypted = encryptShopeeCookieJar(parsed);
    expect(encrypted.encryptedPayload).not.toContain("redacted-session-value");
    expect(decryptShopeeCookieJar({
      encryptedCookieJar: encrypted.encryptedPayload,
      cookieEncryptionIv: encrypted.encryptionIv,
      cookieEncryptionTag: encrypted.encryptionTag,
    })).toEqual(parsed);
    expect(shopeeCookieFingerprint(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("encrypts the API token separately and exposes only a one-way fingerprint", () => {
    const token = "safe-test-token-value";
    const encrypted = encryptShopeePartnerApiToken(token);
    expect(encrypted.encryptedPayload).not.toContain(token);
    expect(decryptShopeePartnerApiToken({
      encryptedApiToken: encrypted.encryptedPayload,
      apiTokenEncryptionIv: encrypted.encryptionIv,
      apiTokenEncryptionTag: encrypted.encryptionTag,
    })).toBe(token);
    expect(shopeePartnerApiTokenFingerprint(token)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("only sends cookies matching the exact target host and path", () => {
    const parsed = parseShopeeCookieExport([
      cookie,
      { ...cookie, name: "wrong_host", domain: "partner.shopee.co.id", hostOnly: true },
      { ...cookie, name: "right_host", domain: "shopeepay.shopee.co.id", hostOnly: true },
      { ...cookie, name: "wrong_path", path: "/merchant/other" },
      { ...cookie, name: "right_path", path: "/merchant/v1" },
    ]);
    const header = shopeeCookieHeader(parsed, SHOPEE_PARTNER_TRANSACTIONS_URL);
    expect(header).toContain("SPC_T_ID=redacted-session-value");
    expect(header).toContain("right_host=redacted-session-value");
    expect(header).toContain("right_path=redacted-session-value");
    expect(header).not.toContain("wrong_host=");
    expect(header).not.toContain("wrong_path=");
  });

  it("builds the verified POST request shape with bounded inputs", () => {
    expect(buildShopeePartnerTransactionRequest({
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
      nextPosition: "cursor-1",
      pageSize: 10,
    })).toEqual({
      data: {
        metadata: {
          token: "safe-test-token-value",
          language: "id",
          timezone: "Asia/Jakarta",
        },
        pageSize: 10,
        filter: {
          startTime: 1788656400,
          endTime: 1788660000,
          serviceList: [1, 3],
        },
        sorter: { field: "createTime", order: "descend" },
        next_position: "cursor-1",
      },
    });
  });

  it("sends an empty pagination cursor for the browser-compatible request", () => {
    expect(buildShopeePartnerTransactionRequest({
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    }).data).toHaveProperty("next_position", "");
  });

  it("uses only the code-owned endpoint and does not accept unknown JSON as payment evidence", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    const fakeFetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
      calledUrl = String(url);
      calledInit = init;
      return new Response("{}", { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await pollShopeePartnerTransactions({
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    }, fakeFetch);
    expect(calledUrl).toBe(SHOPEE_PARTNER_TRANSACTIONS_URL.toString());
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.headers).toMatchObject({
      accept: "application/json, text/plain, */*",
      origin: "https://partner.shopee.co.id",
      referer: "https://partner.shopee.co.id/shopeepay-portal/transactions",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
      "user-agent": expect.stringContaining("Mozilla/5.0"),
      "x-token": "",
    });
    expect(String((calledInit?.headers as Record<string, string>)?.["x-timestamp-ms"])).toMatch(/^\d{13}$/);
    expect(JSON.parse(String(calledInit?.body))).toMatchObject({
      data: {
        metadata: { token: "safe-test-token-value" },
        pageSize: 50,
        filter: { startTime: 1788656400, endTime: 1788660000, serviceList: [1, 3] },
        sorter: { field: "createTime", order: "descend" },
        next_position: "",
      },
    });
    expect(result).toEqual({ status: "contract_unknown", detail: "INVALID_TRANSACTION_LIST_ENVELOPE" });
  });

  it("normalizes the supplied transaction-list envelope through the HTTP poller", async () => {
    const result = await pollShopeePartnerTransactions({
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    }, (async () => new Response(JSON.stringify({
      code: 0,
      data: {
        list: [{
          transactionId: "107097889480042413",
          externalTransactionId: "ATAnrJca34GVm",
          createTime: 1788628053,
          storeId: 23556014,
          service: 1,
          amount: "85.039",
          status: 3,
          transactionType: 1,
          merchantId: 22669496,
        }],
        next_position: "mss:2",
      },
      msg: "",
    }), { headers: { "content-type": "application/json" } })) as typeof fetch);
    expect(result).toMatchObject({
      status: "ok",
      page: {
        nextPosition: "mss:2",
        transactions: [{ externalTransactionId: "107097889480042413", amount: 85039 }],
      },
    });
  });

  it("classifies rate limits, redirects, and HTML responses without reading them as payments", async () => {
    const input = {
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    };
    await expect(pollShopeePartnerTransactions(input, (async () => new Response(null, { status: 429 })) as typeof fetch))
      .resolves.toEqual({ status: "rate_limited", detail: "HTTP 429" });
    await expect(pollShopeePartnerTransactions(input, (async () => new Response(null, { status: 302 })) as typeof fetch))
      .resolves.toEqual({ status: "challenge", detail: "HTTP 302" });
    await expect(pollShopeePartnerTransactions(input, (async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })) as typeof fetch))
      .resolves.toEqual({ status: "challenge", detail: "HTML_RESPONSE" });
  });

  it("rejects a session with no cookie applicable to the transaction host", async () => {
    const result = await pollShopeePartnerTransactions({
      cookies: [{ ...cookie, domain: "partner.shopee.co.id", hostOnly: true }],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    }, vi.fn() as unknown as typeof fetch);
    expect(result).toEqual({ status: "unauthorized", detail: "NO_APPLICABLE_COOKIES" });
  });

  it("rejects oversized windows before making an upstream request", async () => {
    await expect(pollShopeePartnerTransactions({
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-01T00:00:00.000Z"),
      endTime: new Date("2026-09-03T00:00:00.000Z"),
    })).rejects.toThrow("window");
  });

  it("bounds pagination and upstream response size", async () => {
    const input = {
      cookies: [cookie],
      apiToken: "safe-test-token-value",
      startTime: new Date("2026-09-06T01:00:00.000Z"),
      endTime: new Date("2026-09-06T02:00:00.000Z"),
    };
    expect(() => buildShopeePartnerTransactionRequest({ ...input, pageSize: 101 }))
      .toThrow("page size");
    await expect(pollShopeePartnerTransactions(input, (async () => new Response("{}", {
      headers: {
        "content-length": "1048577",
        "content-type": "application/json",
      },
    })) as typeof fetch)).resolves.toEqual({
      status: "response_too_large",
      detail: "RESPONSE_LIMIT_EXCEEDED",
    });
  });
});
