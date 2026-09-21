import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  SHOPEE_PARTNER_MAX_WINDOW_MS,
  pollShopeePartnerTransactions,
  type ShopeePollResult,
} from "@/server/payment/shopee-partner-poller";
import {
  type ShopeePartnerAccountIdentity,
  type ShopeePartnerTransactionCandidate,
} from "@/server/payment/shopee-partner-contract";
import { readShopeePartnerCredentials } from "@/server/payment/shopee-partner-session";
import { cleanError } from "@/server/utils/format";

const LEASE_MS = 45_000;
// A new session needs a non-empty page to learn its merchant identity. Use the
// full bounded window once; active sessions resume from their cursor/overlap.
const INITIAL_LOOKBACK_MS = SHOPEE_PARTNER_MAX_WINDOW_MS;
const OVERLAP_MS = 2 * 60 * 1000;
// Keep the cron invocation below its 30-second route budget even when Shopee
// stalls on every page; subsequent runs resume from the stored cursor.
const MAX_SESSIONS_PER_RUN = 1;
const MAX_PAGES_PER_SESSION = 3;
const REFRESH_MAX_PAGES = 6;
const WORKER_ERROR_RETRY_DELAY_MS = 30_000;

export type WorkerSummary = {
  sessions: number;
  leased: number;
  pages: number;
  received: number;
  unauthorized: number;
  rateLimited: number;
  challenged: number;
  contractUnknown: number;
  accountMismatch: number;
  errors: number;
};

type CandidateSession = {
  id: string;
  pollCursor: string | null;
  pollWindowStartAt: Date | null;
  lastSuccessfulPollAt: Date | null;
  merchantAccountFingerprint: string | null;
  merchantId: string | null;
  storeId: string | null;
};

class LeaseLostError extends Error {
  constructor() {
    super("Shopee Partner polling lease was lost");
    this.name = "LeaseLostError";
  }
}

export function shopeePollableSessionStatusWhere(
  now: Date,
): Prisma.ShopeePartnerSessionWhereInput {
  return {
    OR: [
      { status: { in: ["PENDING_VALIDATION", "ACTIVE"] } },
      {
        status: "ERROR",
        lastErrorCode: "WORKER_ERROR",
        lastErrorAt: {
          lt: new Date(now.getTime() - WORKER_ERROR_RETRY_DELAY_MS),
        },
      },
    ],
  };
}

function availablePollingLeaseWhere(
  now: Date,
): Prisma.ShopeePartnerSessionWhereInput {
  return {
    OR: [
      { pollingLeaseExpiresAt: null },
      { pollingLeaseExpiresAt: { lt: now } },
    ],
  };
}

function pollingStart(input: {
  now: Date;
  pollWindowStartAt: Date | null;
  lastSuccessfulPollAt: Date | null;
}): Date {
  const nowMs = input.now.getTime();
  const configured = input.pollWindowStartAt?.getTime();
  const priorSuccess = input.lastSuccessfulPollAt?.getTime();
  const candidate = configured ?? (priorSuccess === undefined
    ? nowMs - INITIAL_LOOKBACK_MS
    : priorSuccess - OVERLAP_MS);
  return new Date(Math.max(candidate, nowMs - SHOPEE_PARTNER_MAX_WINDOW_MS));
}

function sessionAccount(session: CandidateSession): ShopeePartnerAccountIdentity | undefined {
  if (!session.merchantAccountFingerprint || !session.merchantId || !session.storeId) return undefined;
  return {
    fingerprint: session.merchantAccountFingerprint,
    merchantId: session.merchantId,
    storeId: session.storeId,
  };
}

function sameAccount(left: ShopeePartnerAccountIdentity, right: ShopeePartnerAccountIdentity): boolean {
  return left.fingerprint === right.fingerprint
    && left.merchantId === right.merchantId
    && left.storeId === right.storeId;
}

function resultErrorCode(result: Exclude<ShopeePollResult, { status: "ok" }>): string {
  switch (result.status) {
    case "unauthorized": return "AUTH_REQUIRED";
    case "rate_limited": return "RATE_LIMITED";
    case "challenge": return "UPSTREAM_CHALLENGE";
    case "account_mismatch": return "ACCOUNT_MISMATCH";
    case "contract_unknown": return "UPSTREAM_CONTRACT_UNKNOWN";
    case "response_too_large": return "UPSTREAM_RESPONSE_TOO_LARGE";
    case "upstream_error": return "UPSTREAM_ERROR";
  }
}

async function releaseLease(
  id: string,
  leaseToken: string,
  data: Record<string, unknown>,
) {
  await prisma.shopeePartnerSession.updateMany({
    where: { id, pollingLeaseToken: leaseToken },
    data: {
      ...data,
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
    },
  });
}

async function collectPages(input: {
  session: CandidateSession;
  credentials: { cookies: Awaited<ReturnType<typeof readShopeePartnerCredentials>>["cookies"]; apiToken: string };
  startTime: Date;
  endTime: Date;
  maxPages?: number;
}): Promise<{
  account: ShopeePartnerAccountIdentity;
  transactions: ShopeePartnerTransactionCandidate[];
  nextPosition: string;
  pages: number;
} | { error: Exclude<ShopeePollResult, { status: "ok" }>; pages: number }> {
  const expectedAccount = sessionAccount(input.session);
  const seenCursors = new Set<string>();
  let cursor = input.session.pollCursor ?? "";
  let account = expectedAccount;
  const transactions: ShopeePartnerTransactionCandidate[] = [];
  let pages = 0;

  for (let pageIndex = 0; pageIndex < (input.maxPages ?? MAX_PAGES_PER_SESSION); pageIndex += 1) {
    if (seenCursors.has(cursor)) {
      return { error: { status: "contract_unknown", detail: "PAGINATION_CURSOR_LOOP" }, pages };
    }
    seenCursors.add(cursor);
    const result = await pollShopeePartnerTransactions({
      ...input.credentials,
      startTime: input.startTime,
      endTime: input.endTime,
      nextPosition: cursor || undefined,
      expectedAccount: account,
    });
    if (result.status !== "ok") return { error: result, pages };
    pages += 1;
    if (account && !sameAccount(account, result.page.account)) {
      return { error: { status: "account_mismatch", detail: "SESSION_MERCHANT_IDENTITY_CHANGED" }, pages };
    }
    account = result.page.account;
    transactions.push(...result.page.transactions);
    if (!result.page.nextPosition) {
      return { account, transactions, nextPosition: "", pages };
    }
    if (result.page.nextPosition === cursor) {
      return { error: { status: "contract_unknown", detail: "PAGINATION_CURSOR_LOOP" }, pages };
    }
    cursor = result.page.nextPosition;
  }

  if (!account) {
    return { error: { status: "contract_unknown", detail: "ACCOUNT_IDENTITY_NOT_FOUND" }, pages };
  }
  return { account, transactions, nextPosition: cursor, pages };
}

async function persistBatch(input: {
  session: CandidateSession;
  leaseToken: string;
  account: ShopeePartnerAccountIdentity;
  transactions: ShopeePartnerTransactionCandidate[];
  nextPosition: string;
  startTime: Date;
  now: Date;
}): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.shopeePartnerSession.updateMany({
      where: {
        id: input.session.id,
        pollingLeaseToken: input.leaseToken,
        ...shopeePollableSessionStatusWhere(input.now),
      },
      data: {
        status: "ACTIVE",
        merchantAccountFingerprint: input.account.fingerprint,
        merchantId: input.account.merchantId,
        storeId: input.account.storeId,
        lastValidatedAt: input.now,
        lastSuccessfulPollAt: input.now,
        lastErrorCode: null,
        lastErrorAt: null,
        // Always restart from the newest page on the next run. A persisted
        // cursor can point behind newly inserted transactions and hide a
        // payment that arrived after the previous poll.
        pollWindowStartAt: null,
        pollCursor: null,
        pollingLeaseToken: null,
        pollingLeaseExpiresAt: null,
      },
    });
    if (claimed.count !== 1) throw new LeaseLostError();
    if (input.transactions.length === 0) return 0;
    const inserted = await tx.shopeePartnerTransaction.createMany({
      data: input.transactions.map((transaction) => ({
        ...transaction,
        sessionId: input.session.id,
      })),
      skipDuplicates: true,
    });
    return inserted.count;
  });
}

export async function pollActiveShopeePartnerSessions(
  now = new Date(),
  options: {
    sessionId?: string;
    forceLookbackMs?: number;
    maxPages?: number;
  } = {},
): Promise<WorkerSummary> {
  const candidates = await prisma.shopeePartnerSession.findMany({
    where: {
      ...(options.sessionId ? { id: options.sessionId } : {}),
      encryptedCookieJar: { not: null },
      encryptedApiToken: { not: null },
      AND: [
        shopeePollableSessionStatusWhere(now),
        availablePollingLeaseWhere(now),
      ],
    },
    select: {
      id: true,
      pollCursor: true,
      pollWindowStartAt: true,
      lastSuccessfulPollAt: true,
      merchantAccountFingerprint: true,
      merchantId: true,
      storeId: true,
    },
    take: MAX_SESSIONS_PER_RUN,
    orderBy: [{ lastSuccessfulPollAt: "asc" }, { createdAt: "asc" }],
  });
  const summary: WorkerSummary = {
    sessions: candidates.length,
    leased: 0,
    pages: 0,
    received: 0,
    unauthorized: 0,
    rateLimited: 0,
    challenged: 0,
    contractUnknown: 0,
    accountMismatch: 0,
    errors: 0,
  };

  for (const session of candidates) {
    const leaseToken = randomUUID();
    const claimed = await prisma.shopeePartnerSession.updateMany({
      where: {
        id: session.id,
        AND: [
          shopeePollableSessionStatusWhere(now),
          availablePollingLeaseWhere(now),
        ],
      },
      data: {
        pollingLeaseToken: leaseToken,
        pollingLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      },
    });
    if (claimed.count !== 1) continue;
    summary.leased += 1;

    try {
      const credentials = await readShopeePartnerCredentials(session.id, leaseToken);
      const forceLookbackMs = Math.min(
        Math.max(options.forceLookbackMs ?? 0, 0),
        SHOPEE_PARTNER_MAX_WINDOW_MS,
      );
      const pollingSession = forceLookbackMs > 0
        ? { ...session, pollCursor: null, pollWindowStartAt: null, lastSuccessfulPollAt: null }
        : session;
      const startTime = forceLookbackMs > 0
        ? new Date(now.getTime() - forceLookbackMs)
        : pollingStart({ now, ...pollingSession });
      const maxPages = Math.min(
        REFRESH_MAX_PAGES,
        Math.max(
          1,
          Math.trunc(
            options.maxPages ?? (
              forceLookbackMs > 0 ? REFRESH_MAX_PAGES : MAX_PAGES_PER_SESSION
            ),
          ),
        ),
      );
      const collected = await collectPages({
        session: pollingSession,
        credentials,
        startTime,
        endTime: now,
        maxPages,
      });
      summary.pages += collected.pages;
      if ("error" in collected) {
        if (collected.error.status === "unauthorized") summary.unauthorized += 1;
        else if (collected.error.status === "rate_limited") summary.rateLimited += 1;
        else if (collected.error.status === "challenge") summary.challenged += 1;
        else if (collected.error.status === "contract_unknown") summary.contractUnknown += 1;
        else if (collected.error.status === "account_mismatch") summary.accountMismatch += 1;
        else summary.errors += 1;
        await releaseLease(session.id, leaseToken, {
          ...(collected.error.status === "unauthorized" || collected.error.status === "account_mismatch"
            ? { status: collected.error.status === "unauthorized" ? "EXPIRED" : "ERROR" }
            : {}),
          lastErrorCode: resultErrorCode(collected.error),
          lastErrorAt: new Date(),
        });
        continue;
      }

      const inserted = await persistBatch({
        session,
        leaseToken,
        account: collected.account,
        transactions: collected.transactions,
        nextPosition: collected.nextPosition,
        startTime,
        now,
      });
      summary.received += inserted;
    } catch (error) {
      if (error instanceof LeaseLostError) continue;
      summary.errors += 1;
      console.error("[Shopee Partner worker]", {
        session: session.id.slice(-8),
        error: cleanError(error),
      });
      await releaseLease(session.id, leaseToken, {
        lastErrorCode: "WORKER_ERROR",
        lastErrorAt: new Date(),
      });
    }
  }
  return summary;
}
