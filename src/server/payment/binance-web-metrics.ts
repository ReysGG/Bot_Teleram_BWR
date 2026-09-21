import { prisma } from "@/server/db/prisma";

const METRIC_BUCKET_MS = 5 * 60_000;
const METRIC_RETENTION_MS = 90 * 24 * 60 * 60_000;

export type BinanceWebPollCounters = {
  pages: number;
  received: number;
  detailCalls: number;
  unauthorized: number;
  rateLimited: number;
  challenged: number;
  contractUnknown: number;
  accountMismatch: number;
  identityUnproven: number;
  errors: number;
};

export type BinanceWebErrorRate = BinanceWebPollCounters & {
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  errorRatePercent: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
};

type MetricRow = BinanceWebPollCounters & {
  sessionId?: string;
  bucketStart: Date;
  runs: number;
  successfulRuns: number;
  failedRuns: number;
  lastErrorCode: string | null;
  lastErrorAt: Date | null;
};

function nonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("Invalid Binance web poll metric counter");
  }
  return value;
}

export function binanceWebMetricBucketStart(now = new Date()): Date {
  return new Date(Math.floor(now.getTime() / METRIC_BUCKET_MS) * METRIC_BUCKET_MS);
}

export function binanceWebPollFailed(counters: BinanceWebPollCounters): boolean {
  return counters.unauthorized > 0 ||
    counters.rateLimited > 0 ||
    counters.challenged > 0 ||
    counters.contractUnknown > 0 ||
    counters.accountMismatch > 0 ||
    counters.identityUnproven > 0 ||
    counters.errors > 0;
}

export function binanceWebPollErrorCode(
  counters: BinanceWebPollCounters,
): string | null {
  if (counters.accountMismatch > 0) return "ACCOUNT_MISMATCH";
  if (counters.contractUnknown > 0) return "UPSTREAM_CONTRACT_UNKNOWN";
  if (counters.unauthorized > 0) return "AUTH_REQUIRED";
  if (counters.challenged > 0) return "UPSTREAM_CHALLENGE";
  if (counters.identityUnproven > 0) return "ACCOUNT_IDENTITY_UNPROVEN";
  if (counters.rateLimited > 0) return "RATE_LIMITED";
  if (counters.errors > 0) return "UPSTREAM_ERROR";
  return null;
}

export function summarizeBinanceWebPollMetrics(
  rows: readonly MetricRow[],
  since: Date,
): BinanceWebErrorRate {
  const eligible = rows.filter((row) => row.bucketStart >= since);
  const totals: BinanceWebErrorRate = {
    runs: 0,
    successfulRuns: 0,
    failedRuns: 0,
    errorRatePercent: 0,
    pages: 0,
    received: 0,
    detailCalls: 0,
    unauthorized: 0,
    rateLimited: 0,
    challenged: 0,
    contractUnknown: 0,
    accountMismatch: 0,
    identityUnproven: 0,
    errors: 0,
    lastErrorCode: null,
    lastErrorAt: null,
  };
  for (const row of eligible) {
    totals.runs += row.runs;
    totals.successfulRuns += row.successfulRuns;
    totals.failedRuns += row.failedRuns;
    totals.pages += row.pages;
    totals.received += row.received;
    totals.detailCalls += row.detailCalls;
    totals.unauthorized += row.unauthorized;
    totals.rateLimited += row.rateLimited;
    totals.challenged += row.challenged;
    totals.contractUnknown += row.contractUnknown;
    totals.accountMismatch += row.accountMismatch;
    totals.identityUnproven += row.identityUnproven;
    totals.errors += row.errors;
    if (
      row.lastErrorAt &&
      (!totals.lastErrorAt || row.lastErrorAt > totals.lastErrorAt)
    ) {
      totals.lastErrorAt = row.lastErrorAt;
      totals.lastErrorCode = row.lastErrorCode;
    }
  }
  totals.errorRatePercent = totals.runs === 0
    ? 0
    : Math.round((totals.failedRuns / totals.runs) * 10_000) / 100;
  return totals;
}

export async function recordBinanceWebPollMetric(input: {
  sessionId: string;
  counters: BinanceWebPollCounters;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const counters = {
    pages: nonNegativeInteger(input.counters.pages),
    received: nonNegativeInteger(input.counters.received),
    detailCalls: nonNegativeInteger(input.counters.detailCalls),
    unauthorized: nonNegativeInteger(input.counters.unauthorized),
    rateLimited: nonNegativeInteger(input.counters.rateLimited),
    challenged: nonNegativeInteger(input.counters.challenged),
    contractUnknown: nonNegativeInteger(input.counters.contractUnknown),
    accountMismatch: nonNegativeInteger(input.counters.accountMismatch),
    identityUnproven: nonNegativeInteger(input.counters.identityUnproven),
    errors: nonNegativeInteger(input.counters.errors),
  };
  const failed = binanceWebPollFailed(counters);
  const lastErrorCode = binanceWebPollErrorCode(counters);
  return prisma.binanceWebPollMetric.upsert({
    where: {
      sessionId_bucketStart: {
        sessionId: input.sessionId,
        bucketStart: binanceWebMetricBucketStart(now),
      },
    },
    create: {
      sessionId: input.sessionId,
      bucketStart: binanceWebMetricBucketStart(now),
      runs: 1,
      successfulRuns: failed ? 0 : 1,
      failedRuns: failed ? 1 : 0,
      ...counters,
      lastErrorCode,
      lastErrorAt: failed ? now : null,
    },
    update: {
      runs: { increment: 1 },
      successfulRuns: { increment: failed ? 0 : 1 },
      failedRuns: { increment: failed ? 1 : 0 },
      pages: { increment: counters.pages },
      received: { increment: counters.received },
      detailCalls: { increment: counters.detailCalls },
      unauthorized: { increment: counters.unauthorized },
      rateLimited: { increment: counters.rateLimited },
      challenged: { increment: counters.challenged },
      contractUnknown: { increment: counters.contractUnknown },
      accountMismatch: { increment: counters.accountMismatch },
      identityUnproven: { increment: counters.identityUnproven },
      errors: { increment: counters.errors },
      ...(failed ? { lastErrorCode, lastErrorAt: now } : {}),
    },
  });
}

export async function pruneBinanceWebPollMetrics(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('telegram_binance_web_metric_retention'))`;
    return tx.binanceWebPollMetric.deleteMany({
      where: { bucketStart: { lt: new Date(now.getTime() - METRIC_RETENTION_MS) } },
    });
  });
}

export async function getBinanceWebErrorRateSnapshot(now = new Date()) {
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60_000);
  const rows = await prisma.binanceWebPollMetric.findMany({
    where: { bucketStart: { gte: binanceWebMetricBucketStart(cutoff24h) } },
    select: {
      bucketStart: true,
      runs: true,
      successfulRuns: true,
      failedRuns: true,
      pages: true,
      received: true,
      detailCalls: true,
      unauthorized: true,
      rateLimited: true,
      challenged: true,
      contractUnknown: true,
      accountMismatch: true,
      identityUnproven: true,
      errors: true,
      lastErrorCode: true,
      lastErrorAt: true,
    },
    orderBy: { bucketStart: "desc" },
  });
  return {
    lastHour: summarizeBinanceWebPollMetrics(
      rows,
      binanceWebMetricBucketStart(new Date(now.getTime() - 60 * 60_000)),
    ),
    last24Hours: summarizeBinanceWebPollMetrics(
      rows,
      binanceWebMetricBucketStart(cutoff24h),
    ),
  };
}

export async function getBinanceWebSessionErrorRates(
  sessionIds: readonly string[],
  now = new Date(),
) {
  if (sessionIds.length === 0) return new Map<string, { lastHour: BinanceWebErrorRate; last24Hours: BinanceWebErrorRate }>();
  const cutoff24h = binanceWebMetricBucketStart(new Date(now.getTime() - 24 * 60 * 60_000));
  const rows = await prisma.binanceWebPollMetric.findMany({
    where: { sessionId: { in: [...sessionIds] }, bucketStart: { gte: cutoff24h } },
    select: {
      sessionId: true,
      bucketStart: true,
      runs: true,
      successfulRuns: true,
      failedRuns: true,
      pages: true,
      received: true,
      detailCalls: true,
      unauthorized: true,
      rateLimited: true,
      challenged: true,
      contractUnknown: true,
      accountMismatch: true,
      identityUnproven: true,
      errors: true,
      lastErrorCode: true,
      lastErrorAt: true,
    },
    orderBy: { bucketStart: "desc" },
  });
  const result = new Map<string, { lastHour: BinanceWebErrorRate; last24Hours: BinanceWebErrorRate }>();
  for (const sessionId of sessionIds) {
    const sessionRows = rows.filter((row) => row.sessionId === sessionId);
    result.set(sessionId, {
      lastHour: summarizeBinanceWebPollMetrics(
        sessionRows,
        binanceWebMetricBucketStart(new Date(now.getTime() - 60 * 60_000)),
      ),
      last24Hours: summarizeBinanceWebPollMetrics(sessionRows, cutoff24h),
    });
  }
  return result;
}
