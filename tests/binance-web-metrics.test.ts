import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ upsert: vi.fn(), findMany: vi.fn() }));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    binanceWebPollMetric: {
      upsert: mocks.upsert,
      findMany: mocks.findMany,
    },
  },
}));

import {
  binanceWebMetricBucketStart,
  binanceWebPollErrorCode,
  binanceWebPollFailed,
  recordBinanceWebPollMetric,
  summarizeBinanceWebPollMetrics,
} from "@/server/payment/binance-web-metrics";

function counters(overrides: Record<string, number> = {}) {
  return {
    pages: 1,
    received: 2,
    detailCalls: 1,
    unauthorized: 0,
    rateLimited: 0,
    challenged: 0,
    contractUnknown: 0,
    accountMismatch: 0,
    identityUnproven: 0,
    errors: 0,
    ...overrides,
  };
}

describe("Binance web polling error metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ id: "metric-1" });
  });

  it("uses stable five-minute buckets", () => {
    expect(binanceWebMetricBucketStart(new Date("2026-09-08T10:07:59.999Z")))
      .toEqual(new Date("2026-09-08T10:05:00.000Z"));
  });

  it("classifies failed polls and prioritizes financial identity errors", () => {
    expect(binanceWebPollFailed(counters())).toBe(false);
    expect(binanceWebPollFailed(counters({ rateLimited: 1 }))).toBe(true);
    expect(binanceWebPollErrorCode(counters({
      unauthorized: 1,
      accountMismatch: 1,
    }))).toBe("ACCOUNT_MISMATCH");
  });

  it("calculates error rate and category totals for a selected window", () => {
    const base = {
      bucketStart: new Date("2026-09-08T10:00:00.000Z"),
      runs: 8,
      successfulRuns: 6,
      failedRuns: 2,
      ...counters({ unauthorized: 1, challenged: 1 }),
      lastErrorCode: "UPSTREAM_CHALLENGE",
      lastErrorAt: new Date("2026-09-08T10:04:00.000Z"),
    };
    const summary = summarizeBinanceWebPollMetrics([
      base,
      {
        ...base,
        bucketStart: new Date("2026-09-08T09:00:00.000Z"),
        runs: 2,
        successfulRuns: 2,
        failedRuns: 0,
        unauthorized: 0,
        challenged: 0,
        lastErrorCode: null,
        lastErrorAt: null,
      },
    ], new Date("2026-09-08T09:30:00.000Z"));
    expect(summary).toMatchObject({
      runs: 8,
      successfulRuns: 6,
      failedRuns: 2,
      errorRatePercent: 25,
      unauthorized: 1,
      challenged: 1,
      lastErrorCode: "UPSTREAM_CHALLENGE",
    });
  });

  it("increments one aggregate row without storing request identities", async () => {
    const now = new Date("2026-09-08T10:07:00.000Z");
    await recordBinanceWebPollMetric({
      sessionId: "session-1",
      counters: counters({ contractUnknown: 1 }),
      now,
    });
    const request = mocks.upsert.mock.calls[0][0];
    expect(request.where).toEqual({
      sessionId_bucketStart: {
        sessionId: "session-1",
        bucketStart: new Date("2026-09-08T10:05:00.000Z"),
      },
    });
    expect(request.create).toMatchObject({
      runs: 1,
      successfulRuns: 0,
      failedRuns: 1,
      contractUnknown: 1,
      lastErrorCode: "UPSTREAM_CONTRACT_UNKNOWN",
    });
    expect(JSON.stringify(request)).not.toMatch(/cookie|orderId|providerTransaction/i);
  });
});
