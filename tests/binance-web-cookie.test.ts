import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  binanceWebCookieFingerprint,
  binanceWebCookieHeader,
  decryptBinanceWebCookieJar,
  encryptBinanceWebCookieJar,
  parseBinanceWebCookieExport,
} from "@/server/payment/binance-web-cookie";
import {
  BINANCE_WEB_HISTORY_URL,
  buildBinanceWebHistoryRequest,
  pollBinanceWebHistory,
} from "@/server/payment/binance-web-poller";

const cookie = {
  domain: ".binance.com",
  expirationDate: 2_000_000_000,
  httpOnly: true,
  name: "session_test",
  path: "/",
  secure: true,
  value: "redacted-session-value",
};

describe("Binance web cookie and poller", () => {
  beforeEach(() => {
    process.env.PAYMENT_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 12).toString("base64");
  });

  it("accepts Binance cookies, removes expired rows, and rejects lookalike domains", () => {
    const parsed = parseBinanceWebCookieExport([
      cookie,
      { ...cookie, name: "expired", expirationDate: 1 },
    ], 1_000_000);
    expect(parsed).toHaveLength(1);
    expect(binanceWebCookieHeader(parsed, BINANCE_WEB_HISTORY_URL))
      .toContain("session_test=redacted-session-value");
    expect(() => parseBinanceWebCookieExport([
      { ...cookie, domain: "binance.com.example.test" },
    ])).toThrow("binance.com");
  });

  it("filters host/path cookies and rejects duplicate keys", () => {
    const parsed = parseBinanceWebCookieExport([
      cookie,
      { ...cookie, name: "host", domain: "www.binance.com", hostOnly: true },
      { ...cookie, name: "wrong-host", domain: "pay.binance.com", hostOnly: true },
      { ...cookie, name: "right-path", path: "/bapi/pay" },
      { ...cookie, name: "wrong-path", path: "/api/other" },
    ]);
    const header = binanceWebCookieHeader(parsed, BINANCE_WEB_HISTORY_URL);
    expect(header).toContain("host=redacted-session-value");
    expect(header).toContain("right-path=redacted-session-value");
    expect(header).not.toContain("wrong-host=");
    expect(header).not.toContain("wrong-path=");
    expect(() => parseBinanceWebCookieExport([cookie, { ...cookie }]))
      .toThrow("duplikat");
  });

  it("accepts browser exports with empty and JSON-like cookie values", () => {
    const parsed = parseBinanceWebCookieExport([
      { ...cookie, name: "currentAccount", value: "" },
      { ...cookie, name: "g_state", value: '{"i_l":0,"i_ll":1}' },
    ]);
    expect(parsed.map((item) => item.name)).toEqual(["currentAccount", "g_state"]);
    expect(binanceWebCookieHeader(parsed, BINANCE_WEB_HISTORY_URL)).toContain(
      'g_state={"i_l":0,"i_ll":1}',
    );
  });

  it("rejects cookie header delimiters and control characters", () => {
    expect(() => parseBinanceWebCookieExport([
      { ...cookie, value: "a;b" },
    ])).toThrow("tidak aman");
    expect(() => parseBinanceWebCookieExport([
      { ...cookie, value: "a\n b" },
    ])).toThrow("tidak aman");
  });

  it("encrypts cookie values and exposes only a stable fingerprint", () => {
    const parsed = parseBinanceWebCookieExport([cookie]);
    const encrypted = encryptBinanceWebCookieJar(parsed);
    expect(encrypted.encryptedPayload).not.toContain(cookie.value);
    expect(decryptBinanceWebCookieJar({
      encryptedCookieJar: encrypted.encryptedPayload,
      cookieEncryptionIv: encrypted.encryptionIv,
      cookieEncryptionTag: encrypted.encryptionTag,
    })).toEqual(parsed);
    expect(binanceWebCookieFingerprint(parsed)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("builds the verified incoming-history request", () => {
    expect(buildBinanceWebHistoryRequest({
      startDate: new Date("2026-09-08T01:00:00.000Z"),
      endDate: new Date("2026-09-08T02:00:00.000Z"),
      lastTransactionTime: 1_788_628_053_000n,
      pageSize: 20,
    })).toEqual({
      type: "INCOME",
      startDate: 1788829200000,
      endDate: 1788832800000,
      lastTransactionTime: 1788628053000,
      size: 20,
    });
  });

  it("uses the code-owned endpoint and parses the response", async () => {
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (url: URL | RequestInfo, init?: RequestInit) => {
      calledUrl = String(url);
      calledInit = init;
      return new Response(JSON.stringify({
        code: "000000",
        success: true,
        data: {
          transactionList: [{
            transactionId: "txn_1",
            transactionTime: 1_788_628_053_000,
            type: "INCOME",
            transactionType: "C2C",
            amount: "5.000001",
            currency: "USDT",
            status: "SUCCESS",
          }],
          hasMore: false,
        },
      }), { headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    const result = await pollBinanceWebHistory({
      cookies: [cookie],
      startDate: new Date("2026-09-08T01:00:00.000Z"),
      endDate: new Date("2026-09-08T02:00:00.000Z"),
    }, fetchImpl);
    expect(calledUrl).toBe(BINANCE_WEB_HISTORY_URL.toString());
    expect(calledInit?.method).toBe("POST");
    expect(calledInit?.redirect).toBe("manual");
    expect(JSON.parse(String(calledInit?.body))).toMatchObject({
      type: "INCOME",
      lastTransactionTime: 0,
      size: 20,
    });
    expect(result).toMatchObject({
      status: "ok",
      page: { transactions: [{ providerTransactionId: "txn_1" }] },
    });
  });

  it("classifies rate limits, redirects, and HTML without treating them as evidence", async () => {
    const input = {
      cookies: [cookie],
      startDate: new Date("2026-09-08T01:00:00.000Z"),
      endDate: new Date("2026-09-08T02:00:00.000Z"),
    };
    await expect(pollBinanceWebHistory(input, (async () => new Response(null, { status: 429 })) as typeof fetch))
      .resolves.toEqual({ status: "rate_limited", detail: "HTTP_429" });
    await expect(pollBinanceWebHistory(input, (async () => new Response(null, { status: 302 })) as typeof fetch))
      .resolves.toEqual({ status: "challenge", detail: "HTTP_302" });
    await expect(pollBinanceWebHistory(input, (async () => new Response("<html></html>", { headers: { "content-type": "text/html" } })) as typeof fetch))
      .resolves.toEqual({ status: "challenge", detail: "HTML_RESPONSE" });
  });
});
