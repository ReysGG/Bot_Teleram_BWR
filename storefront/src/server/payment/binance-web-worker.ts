import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { integerEnv } from "@/server/env";
import {
  pollBinanceWebAccountIdentity,
  pollBinanceWebDetail,
  pollBinanceWebHistory,
  type BinanceWebPollFailure,
} from "@/server/payment/binance-web-poller";
import {
  type BinanceWebDetail,
  type BinanceWebTransactionCandidate,
} from "@/server/payment/binance-web-contract";
import {
  binanceWebAccountFingerprint,
  classifyBinanceWebAccountProof,
  readBinanceWebSessionCredentials,
} from "@/server/payment/binance-web-session";
import {
  pruneBinanceWebPollMetrics,
  recordBinanceWebPollMetric,
  type BinanceWebPollCounters,
} from "@/server/payment/binance-web-metrics";
import { cleanError } from "@/server/utils/format";

const LEASE_MS = 45_000;
const DEFAULT_LOOKBACK_HOURS = 24;
const DEFAULT_MAX_PAGES = 3;
const DEFAULT_MAX_DETAIL_CALLS = 5;

type CandidateSession = {
  id: string;
  status: string;
  isPrimary: boolean;
  recipientBinanceId: string | null;
  accountFingerprint: string | null;
};

export type BinanceWebWorkerSummary = {
  sessions: number;
  leased: number;
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

type EnrichedTransaction = BinanceWebTransactionCandidate & {
  detail: BinanceWebDetail | null;
};

class LeaseLostError extends Error {
  constructor() {
    super("Binance web polling lease was lost");
    this.name = "LeaseLostError";
  }
}

function boundedIntegerEnv(name: string, fallback: number, maximum: number): number {
  return Math.min(maximum, Math.max(1, integerEnv(name, fallback)));
}

function safeErrorCode(result: BinanceWebPollFailure): string {
  switch (result.status) {
    case "unauthorized": return "AUTH_REQUIRED";
    case "rate_limited": return "RATE_LIMITED";
    case "challenge": return "UPSTREAM_CHALLENGE";
    case "contract_unknown": return "UPSTREAM_CONTRACT_UNKNOWN";
    case "response_too_large": return "UPSTREAM_RESPONSE_TOO_LARGE";
    case "upstream_error": return "UPSTREAM_ERROR";
  }
}

function countFailure(summary: BinanceWebWorkerSummary, failure: BinanceWebPollFailure) {
  if (failure.status === "unauthorized") summary.unauthorized += 1;
  else if (failure.status === "rate_limited") summary.rateLimited += 1;
  else if (failure.status === "challenge") summary.challenged += 1;
  else if (failure.status === "contract_unknown" || failure.status === "response_too_large") {
    summary.contractUnknown += 1;
  } else summary.errors += 1;
}

function metricCounters(summary: BinanceWebWorkerSummary): BinanceWebPollCounters {
  return {
    pages: summary.pages,
    received: summary.received,
    detailCalls: summary.detailCalls,
    unauthorized: summary.unauthorized,
    rateLimited: summary.rateLimited,
    challenged: summary.challenged,
    contractUnknown: summary.contractUnknown,
    accountMismatch: summary.accountMismatch,
    identityUnproven: summary.identityUnproven,
    errors: summary.errors,
  };
}

function metricDelta(
  before: BinanceWebPollCounters,
  after: BinanceWebWorkerSummary,
): BinanceWebPollCounters {
  const current = metricCounters(after);
  return {
    pages: current.pages - before.pages,
    received: current.received - before.received,
    detailCalls: current.detailCalls - before.detailCalls,
    unauthorized: current.unauthorized - before.unauthorized,
    rateLimited: current.rateLimited - before.rateLimited,
    challenged: current.challenged - before.challenged,
    contractUnknown: current.contractUnknown - before.contractUnknown,
    accountMismatch: current.accountMismatch - before.accountMismatch,
    identityUnproven: current.identityUnproven - before.identityUnproven,
    errors: current.errors - before.errors,
  };
}

async function releaseLease(
  id: string,
  leaseToken: string,
  data: Record<string, unknown>,
) {
  await prisma.binanceWebSession.updateMany({
    where: { id, pollingLeaseToken: leaseToken },
    data: {
      ...data,
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
    },
  });
}

async function failSession(
  session: CandidateSession,
  leaseToken: string,
  errorCode: string,
  now: Date,
) {
  const terminal =
    errorCode === "AUTH_REQUIRED"
      ? "EXPIRED"
      : errorCode === "UPSTREAM_CHALLENGE"
        ? "CHALLENGED"
        : errorCode === "ACCOUNT_MISMATCH" ||
            errorCode === "UPSTREAM_CONTRACT_UNKNOWN" ||
            errorCode === "UPSTREAM_RESPONSE_TOO_LARGE"
          ? "ERROR"
          : null;
  await releaseLease(session.id, leaseToken, {
    ...(terminal ? { status: terminal, isPrimary: false } : {}),
    lastErrorCode: errorCode,
    lastErrorAt: now,
  });
}

async function collectHistory(input: {
  session: CandidateSession;
  cookies: Awaited<ReturnType<typeof readBinanceWebSessionCredentials>>["cookies"];
  now: Date;
  maxPages: number;
  fetchImpl: typeof fetch;
}): Promise<
  | { status: "ok"; pages: number; transactions: BinanceWebTransactionCandidate[] }
  | { status: "error"; pages: number; failure: BinanceWebPollFailure }
> {
  const lookbackHours = boundedIntegerEnv(
    "BINANCE_WEB_SESSION_MAX_LOOKBACK_HOURS",
    DEFAULT_LOOKBACK_HOURS,
    24 * 90,
  );
  const startDate = new Date(input.now.getTime() - lookbackHours * 60 * 60_000);
  const seenCursors = new Set<string>();
  const transactions: BinanceWebTransactionCandidate[] = [];
  let cursor = 0n;
  let pages = 0;

  for (let page = 0; page < input.maxPages; page += 1) {
    const cursorKey = cursor.toString();
    if (seenCursors.has(cursorKey)) {
      return {
        status: "error",
        pages,
        failure: { status: "contract_unknown", detail: "PAGINATION_CURSOR_LOOP" },
      };
    }
    seenCursors.add(cursorKey);
    const result = await pollBinanceWebHistory(
      {
        cookies: input.cookies,
        startDate,
        endDate: input.now,
        lastTransactionTime: cursor,
      },
      input.fetchImpl,
    );
    if (result.status !== "ok") {
      return { status: "error", pages, failure: result };
    }
    pages += 1;
    transactions.push(...result.page.transactions);
    if (!result.page.hasMore) break;
    const next = result.page.nextTransactionTime;
    if (next === null || next === cursor) {
      return {
        status: "error",
        pages,
        failure: { status: "contract_unknown", detail: "PAGINATION_CURSOR_LOOP" },
      };
    }
    cursor = next;
  }
  const unique = new Map<string, BinanceWebTransactionCandidate>();
  for (const transaction of transactions) {
    const prior = unique.get(transaction.providerTransactionId);
    if (prior && prior.rawPayloadHash !== transaction.rawPayloadHash) {
      return {
        status: "error",
        pages,
        failure: { status: "contract_unknown", detail: "DUPLICATE_TRANSACTION_CONFLICT" },
      };
    }
    unique.set(transaction.providerTransactionId, transaction);
  }
  return { status: "ok", pages, transactions: [...unique.values()] };
}

async function enrichWithDetails(input: {
  session: CandidateSession;
  accountFingerprint: string;
  cookies: Awaited<ReturnType<typeof readBinanceWebSessionCredentials>>["cookies"];
  transactions: BinanceWebTransactionCandidate[];
  maxDetailCalls: number;
  fetchImpl: typeof fetch;
}): Promise<
  | { status: "ok"; transactions: EnrichedTransaction[]; detailCalls: number }
  | { status: "error"; detailCalls: number; failure: BinanceWebPollFailure }
> {
  const ids = [...new Set(input.transactions.map((item) => item.providerTransactionId))];
  const existing = ids.length === 0
    ? []
    : await prisma.binanceWebTransaction.findMany({
        where: {
          accountFingerprint: input.accountFingerprint,
          providerTransactionId: { in: ids },
        },
        select: {
          providerTransactionId: true,
          providerOrderId: true,
          receiverBinanceId: true,
          detailPayloadHash: true,
        },
      });
  const existingById = new Map(existing.map((item) => [item.providerTransactionId, item]));
  const detailTargets: BinanceWebTransactionCandidate[] = [];
  const resolvedById = new Map<string, EnrichedTransaction>();
  for (const transaction of input.transactions) {
    const prior = existingById.get(transaction.providerTransactionId);
    if (
      prior?.providerOrderId &&
      transaction.providerOrderId &&
      prior.providerOrderId !== transaction.providerOrderId
    ) {
      return {
        status: "error",
        detailCalls: 0,
        failure: { status: "contract_unknown", detail: "HISTORY_ORDER_ID_CHANGED" },
      };
    }
    if (
      prior?.receiverBinanceId &&
      transaction.receiverBinanceId &&
      prior.receiverBinanceId !== transaction.receiverBinanceId
    ) {
      return {
        status: "error",
        detailCalls: 0,
        failure: { status: "contract_unknown", detail: "HISTORY_RECEIVER_CHANGED" },
      };
    }
    const knownOrderId = transaction.providerOrderId ?? prior?.providerOrderId ?? null;
    const knownReceiverId = transaction.receiverBinanceId ?? prior?.receiverBinanceId ?? null;
    if (knownOrderId && knownReceiverId) {
      resolvedById.set(transaction.providerTransactionId, {
        ...transaction,
        providerOrderId: knownOrderId,
        receiverBinanceId: knownReceiverId,
        detailPayloadHash: transaction.detailPayloadHash ?? prior?.detailPayloadHash ?? null,
        detail: null,
      });
      continue;
    }
    if (detailTargets.length < input.maxDetailCalls) detailTargets.push(transaction);
  }

  const detailResults = await Promise.all(detailTargets.map(async (transaction) => ({
    transaction,
    result: await pollBinanceWebDetail(
      { cookies: input.cookies, providerTransactionId: transaction.providerTransactionId },
      input.fetchImpl,
    ),
  })));
  for (const { transaction, result } of detailResults) {
    if (result.status !== "ok") {
      return { status: "error", detailCalls: detailResults.length, failure: result };
    }
    if (
      result.detail.providerTransactionId &&
      result.detail.providerTransactionId !== transaction.providerTransactionId
    ) {
      return {
        status: "error",
        detailCalls: detailResults.length,
        failure: { status: "contract_unknown", detail: "DETAIL_TRANSACTION_MISMATCH" },
      };
    }
    if (
      (result.detail.amountMicros !== null &&
        result.detail.amountMicros !== transaction.amountMicros) ||
      (result.detail.currency !== null &&
        result.detail.currency !== transaction.currency) ||
      (result.detail.occurredAt !== null &&
        result.detail.occurredAt.getTime() !== transaction.occurredAt.getTime()) ||
      (result.detail.receiverBinanceId !== null &&
        transaction.receiverBinanceId !== null &&
        result.detail.receiverBinanceId !== transaction.receiverBinanceId)
    ) {
      return {
        status: "error",
        detailCalls: detailResults.length,
        failure: { status: "contract_unknown", detail: "DETAIL_HISTORY_MISMATCH" },
      };
    }
    resolvedById.set(transaction.providerTransactionId, {
      ...transaction,
      providerOrderId: result.detail.providerOrderId,
      receiverBinanceId:
        result.detail.receiverBinanceId ?? transaction.receiverBinanceId,
      detailPayloadHash: result.detail.rawPayloadHash,
      detail: result.detail,
    });
  }
  return {
    status: "ok",
    transactions: input.transactions.map((transaction) =>
      resolvedById.get(transaction.providerTransactionId) ?? {
        ...transaction,
        detail: null,
      },
    ),
    detailCalls: detailResults.length,
  };
}

async function persistBatch(input: {
  session: CandidateSession;
  leaseToken: string;
  accountFingerprint: string;
  transactions: EnrichedTransaction[];
  provenRecipientBinanceId: string;
  now: Date;
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.binanceWebSession.updateMany({
      where: {
        id: input.session.id,
        pollingLeaseToken: input.leaseToken,
        status: { in: ["PENDING_VALIDATION", "ACTIVE"] },
      },
      data: {
        status: "ACTIVE",
        recipientBinanceId: input.provenRecipientBinanceId,
        accountFingerprint: input.accountFingerprint,
        lastValidatedAt: input.now,
        lastSuccessfulPollAt: input.now,
        lastErrorCode: null,
        lastErrorAt: null,
        pollCursorTime: input.transactions.at(-1)
          ? BigInt(input.transactions.at(-1)!.occurredAt.getTime())
          : null,
        pollingLeaseToken: null,
        pollingLeaseExpiresAt: null,
      },
    });
    if (claimed.count !== 1) throw new LeaseLostError();

    let inserted = 0;
    for (const transaction of input.transactions) {
      const existing = await tx.binanceWebTransaction.findUnique({
        where: {
          accountFingerprint_providerTransactionId: {
            accountFingerprint: input.accountFingerprint,
            providerTransactionId: transaction.providerTransactionId,
          },
        },
        select: { id: true },
      });
      await tx.binanceWebTransaction.upsert({
        where: {
          accountFingerprint_providerTransactionId: {
            accountFingerprint: input.accountFingerprint,
            providerTransactionId: transaction.providerTransactionId,
          },
        },
        create: {
          sessionId: input.session.id,
          accountFingerprint: input.accountFingerprint,
          providerTransactionId: transaction.providerTransactionId,
          providerOrderId: transaction.providerOrderId,
          transactionType: transaction.transactionType,
          direction: transaction.direction,
          providerStatus: transaction.providerStatus,
          providerStatusDetail: transaction.providerStatusDetail,
          currency: transaction.currency,
          amountMicros: transaction.amountMicros,
          counterpartyName: transaction.counterpartyName,
          viaAccountValue: transaction.viaAccountValue,
          receiverBinanceId: transaction.receiverBinanceId,
          occurredAt: transaction.occurredAt,
          rawPayloadHash: transaction.rawPayloadHash,
          detailPayloadHash: transaction.detailPayloadHash,
        },
        update: {
          sessionId: input.session.id,
          providerOrderId: transaction.providerOrderId ?? undefined,
          providerStatus: transaction.providerStatus,
          providerStatusDetail: transaction.providerStatusDetail,
          receiverBinanceId: transaction.receiverBinanceId ?? undefined,
          rawPayloadHash: transaction.rawPayloadHash,
          detailPayloadHash: transaction.detailPayloadHash ?? undefined,
        },
      });
      if (!existing) inserted += 1;
    }
    return inserted;
  });
}

async function pollSession(input: {
  session: CandidateSession;
  summary: BinanceWebWorkerSummary;
  now: Date;
  maxPages: number;
  maxDetailCalls: number;
  fetchImpl: typeof fetch;
}) {
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(input.now.getTime() + LEASE_MS);
  const leased = await prisma.binanceWebSession.updateMany({
    where: {
      id: input.session.id,
      status: { in: ["PENDING_VALIDATION", "ACTIVE"] },
      OR: [
        { pollingLeaseExpiresAt: null },
        { pollingLeaseExpiresAt: { lte: input.now } },
      ],
    },
    data: { pollingLeaseToken: leaseToken, pollingLeaseExpiresAt: leaseExpiresAt },
  });
  if (leased.count !== 1) return;
  input.summary.leased += 1;
  const metricBaseline = metricCounters(input.summary);

  try {

  let credentials: Awaited<ReturnType<typeof readBinanceWebSessionCredentials>>;
  try {
    credentials = await readBinanceWebSessionCredentials(input.session.id, leaseToken);
  } catch {
    await failSession(input.session, leaseToken, "CREDENTIAL_DECRYPT_FAILED", input.now);
    input.summary.errors += 1;
    return;
  }

  let identityBinanceId: string | null = null;
  if (!input.session.accountFingerprint) {
    const identity = await pollBinanceWebAccountIdentity(credentials.cookies, input.fetchImpl);
    if (identity.status === "ok") {
      identityBinanceId = identity.binanceId;
      if (identity.binanceId !== input.session.recipientBinanceId) {
        await failSession(input.session, leaseToken, "ACCOUNT_MISMATCH", input.now);
        input.summary.accountMismatch += 1;
        return;
      }
    } else if (["unauthorized", "rate_limited", "challenge"].includes(identity.status)) {
      countFailure(input.summary, identity);
      await failSession(input.session, leaseToken, safeErrorCode(identity), input.now);
      return;
    }
  }

  const history = await collectHistory({
    session: input.session,
    cookies: credentials.cookies,
    now: input.now,
    maxPages: input.maxPages,
    fetchImpl: input.fetchImpl,
  });
  input.summary.pages += history.pages;
  if (history.status === "error") {
    countFailure(input.summary, history.failure);
    await failSession(
      input.session,
      leaseToken,
      safeErrorCode(history.failure),
      input.now,
    );
    return;
  }

  if (!input.session.recipientBinanceId) {
    await failSession(input.session, leaseToken, "RECIPIENT_NOT_CONFIGURED", input.now);
    input.summary.errors += 1;
    return;
  }
  const expectedFingerprint = binanceWebAccountFingerprint(
    input.session.recipientBinanceId,
  );
  if (
    input.session.accountFingerprint &&
    input.session.accountFingerprint !== expectedFingerprint
  ) {
    await failSession(input.session, leaseToken, "ACCOUNT_MISMATCH", input.now);
    input.summary.accountMismatch += 1;
    return;
  }

  const enriched = await enrichWithDetails({
    session: input.session,
    accountFingerprint: expectedFingerprint,
    cookies: credentials.cookies,
    transactions: history.transactions,
    maxDetailCalls: input.maxDetailCalls,
    fetchImpl: input.fetchImpl,
  });
  input.summary.detailCalls += enriched.detailCalls;
  if (enriched.status === "error") {
    countFailure(input.summary, enriched.failure);
    await failSession(
      input.session,
      leaseToken,
      safeErrorCode(enriched.failure),
      input.now,
    );
    return;
  }

  const provenIds = new Set(
    enriched.transactions
      .map((transaction) => transaction.receiverBinanceId)
      .filter((value): value is string => Boolean(value)),
  );
  if (identityBinanceId) provenIds.add(identityBinanceId);
  const accountProof = classifyBinanceWebAccountProof({
    expectedRecipientBinanceId: input.session.recipientBinanceId,
    storedAccountFingerprint: input.session.accountFingerprint,
    sessionStatus: input.session.status,
    observedReceiverBinanceIds: [...provenIds],
  });
  if (accountProof === "MISMATCH") {
    await failSession(input.session, leaseToken, "ACCOUNT_MISMATCH", input.now);
    input.summary.accountMismatch += 1;
    return;
  }
  if (accountProof !== "PROVEN") {
    await failSession(input.session, leaseToken, "ACCOUNT_IDENTITY_UNPROVEN", input.now);
    input.summary.identityUnproven += 1;
    return;
  }

  try {
    input.summary.received += await persistBatch({
      session: input.session,
      leaseToken,
      accountFingerprint: expectedFingerprint,
      transactions: enriched.transactions,
      provenRecipientBinanceId: input.session.recipientBinanceId,
      now: input.now,
    });
  } catch {
    input.summary.errors += 1;
    await releaseLease(input.session.id, leaseToken, {
      lastErrorCode: "PERSIST_FAILED",
      lastErrorAt: input.now,
    });
  }
  } catch (error) {
    input.summary.errors += 1;
    try {
      await releaseLease(input.session.id, leaseToken, {
        lastErrorCode: "WORKER_ERROR",
        lastErrorAt: input.now,
      });
    } catch {
      // The lease expires naturally if the database is temporarily unavailable.
    }
    console.warn("[Binance web polling worker]", {
      sessionId: input.session.id,
      error: cleanError(error),
    });
  } finally {
    try {
      if (input.now.getMinutes() === 0 && input.now.getSeconds() < 30) {
        await pruneBinanceWebPollMetrics(input.now);
      }
      await recordBinanceWebPollMetric({
        sessionId: input.session.id,
        counters: metricDelta(metricBaseline, input.summary),
        now: input.now,
      });
    } catch (error) {
      console.warn("[Binance web polling metric]", {
        sessionId: input.session.id,
        error: cleanError(error),
      });
    }
  }
}

export async function pollBinanceWebSessions(input: {
  sessionId?: string;
  maxPages?: number;
  maxDetailCalls?: number;
  now?: Date;
  fetchImpl?: typeof fetch;
} = {}): Promise<BinanceWebWorkerSummary> {
  const now = input.now ?? new Date();
  const maxPages = Math.min(
    10,
    Math.max(
      1,
      input.maxPages ?? boundedIntegerEnv(
        "BINANCE_WEB_SESSION_MAX_PAGES_PER_RUN",
        DEFAULT_MAX_PAGES,
        10,
      ),
    ),
  );
  const maxDetailCalls = Math.min(
    50,
    Math.max(
      1,
      input.maxDetailCalls ?? boundedIntegerEnv(
        "BINANCE_WEB_SESSION_MAX_DETAIL_CALLS_PER_RUN",
        DEFAULT_MAX_DETAIL_CALLS,
        50,
      ),
    ),
  );
  const sessions = await prisma.binanceWebSession.findMany({
    where: {
      ...(input.sessionId
        ? { id: input.sessionId, status: { in: ["PENDING_VALIDATION", "ACTIVE"] } }
        : {
            OR: [
              { status: "PENDING_VALIDATION" },
              { status: "ACTIVE", isPrimary: true },
            ],
          }),
    },
    select: {
      id: true,
      status: true,
      isPrimary: true,
      recipientBinanceId: true,
      accountFingerprint: true,
    },
    orderBy: [{ isPrimary: "desc" }, { lastSuccessfulPollAt: "asc" }],
    take: input.sessionId ? 1 : 1,
  });
  const summary: BinanceWebWorkerSummary = {
    sessions: sessions.length,
    leased: 0,
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
  };
  for (const session of sessions) {
    await pollSession({
      session,
      summary,
      now,
      maxPages,
      maxDetailCalls,
      fetchImpl: input.fetchImpl ?? fetch,
    });
  }
  return summary;
}
