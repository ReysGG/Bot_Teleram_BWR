import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  txUpdateMany: vi.fn(),
  createMany: vi.fn(),
  transaction: vi.fn(),
  readCredentials: vi.fn(),
  poll: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    shopeePartnerSession: {
      findMany: mocks.findMany,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/server/payment/shopee-partner-session", () => ({
  readShopeePartnerCredentials: mocks.readCredentials,
}));
vi.mock("@/server/payment/shopee-partner-poller", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/payment/shopee-partner-poller")>();
  return { ...original, pollShopeePartnerTransactions: mocks.poll };
});

import {
  pollActiveShopeePartnerSessions,
  shopeePollableSessionStatusWhere,
} from "@/server/payment/shopee-partner-worker";

const NOW = new Date("2026-09-06T02:00:00.000Z");
const candidate = {
  id: "session-1",
  pollCursor: null,
  pollWindowStartAt: null,
  lastSuccessfulPollAt: null,
  merchantAccountFingerprint: null,
  merchantId: null,
  storeId: null,
};

describe("Shopee Partner polling lease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([candidate]);
    mocks.readCredentials.mockResolvedValue({
      cookies: [],
      apiToken: "safe-test-token-value",
    });
    mocks.poll.mockResolvedValue({
      status: "contract_unknown",
      detail: "RESPONSE_CONTRACT_NOT_VERIFIED",
    });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      shopeePartnerSession: { updateMany: mocks.txUpdateMany },
      shopeePartnerTransaction: { createMany: mocks.createMany },
    }));
    mocks.txUpdateMany.mockResolvedValue({ count: 1 });
    mocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("skips a session when another worker wins the lease", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(pollActiveShopeePartnerSessions(NOW)).resolves.toMatchObject({
      sessions: 1,
      leased: 0,
    });
    expect(mocks.readCredentials).not.toHaveBeenCalled();
    expect(mocks.poll).not.toHaveBeenCalled();
  });

  it("retries only generic worker errors after a bounded delay", () => {
    expect(shopeePollableSessionStatusWhere(NOW)).toEqual({
      OR: [
        { status: { in: ["PENDING_VALIDATION", "ACTIVE"] } },
        {
          status: "ERROR",
          lastErrorCode: "WORKER_ERROR",
          lastErrorAt: { lt: new Date("2026-09-06T01:59:30.000Z") },
        },
      ],
    });
  });

  it("keeps a valid session retryable after an internal worker exception", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    mocks.readCredentials.mockRejectedValueOnce(new Error("temporary decrypt worker failure"));

    const result = await pollActiveShopeePartnerSessions(NOW);

    expect(result).toMatchObject({ leased: 1, errors: 1 });
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      lastErrorCode: "WORKER_ERROR",
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
    });
    expect(mocks.updateMany.mock.calls[1][0].data).not.toHaveProperty("status");
    expect(consoleError).toHaveBeenCalledWith("[Shopee Partner worker]", {
      session: "ession-1",
      error: "temporary decrypt worker failure",
    });
    consoleError.mockRestore();
  });

  it("polls outside the claim and releases the same lease fail-closed", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    const result = await pollActiveShopeePartnerSessions(NOW);
    expect(result).toMatchObject({ leased: 1, contractUnknown: 1, errors: 0 });
    const claim = mocks.updateMany.mock.calls[0][0];
    const release = mocks.updateMany.mock.calls[1][0];
    expect(mocks.readCredentials).toHaveBeenCalledWith("session-1", claim.data.pollingLeaseToken);
    expect(release.where).toEqual({ id: "session-1", pollingLeaseToken: claim.data.pollingLeaseToken });
    expect(release.data).toMatchObject({
      pollingLeaseToken: null,
      pollingLeaseExpiresAt: null,
      lastErrorCode: "UPSTREAM_CONTRACT_UNKNOWN",
    });
    expect(mocks.poll).toHaveBeenCalledWith(expect.objectContaining({
      startTime: new Date("2026-09-05T02:00:00.000Z"),
      endTime: NOW,
    }));
  });

  it("expires credentials after an unauthorized response", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    mocks.poll.mockResolvedValue({ status: "unauthorized", detail: "HTTP 401" });
    const result = await pollActiveShopeePartnerSessions(NOW);
    expect(result.unauthorized).toBe(1);
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      status: "EXPIRED",
      lastErrorCode: "AUTH_REQUIRED",
      pollingLeaseToken: null,
    });
  });

  it("persists normalized pages atomically and advances the cursor", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.poll
      .mockResolvedValueOnce({
        status: "ok",
        page: {
          account: { merchantId: "22669496", storeId: "23556014", fingerprint: "a".repeat(64) },
          transactions: [{
            externalTransactionId: "107097889480042413",
            merchantExternalTransactionId: "ATAnrJca34GVm",
            merchantAccountFingerprint: "a".repeat(64),
            merchantId: "22669496",
            storeId: "23556014",
            service: 1,
            transactionType: 1,
            statusCode: 3,
            amount: 85039,
            occurredAt: new Date("2026-09-06T01:00:00.000Z"),
            rawPayloadHash: "b".repeat(64),
          }],
          nextPosition: "mss:2",
          skippedCount: 0,
        },
      })
      .mockResolvedValueOnce({
        status: "ok",
        page: {
          account: { merchantId: "22669496", storeId: "23556014", fingerprint: "a".repeat(64) },
          transactions: [],
          nextPosition: "",
          skippedCount: 0,
        },
      });
    const result = await pollActiveShopeePartnerSessions(NOW);
    expect(result).toMatchObject({ leased: 1, pages: 2, received: 1, errors: 0 });
    expect(mocks.poll).toHaveBeenNthCalledWith(2, expect.objectContaining({ nextPosition: "mss:2" }));
    expect(mocks.txUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ status: "ERROR", lastErrorCode: "WORKER_ERROR" }),
        ]),
      }),
      data: expect.objectContaining({
        status: "ACTIVE",
        merchantAccountFingerprint: "a".repeat(64),
        merchantId: "22669496",
        storeId: "23556014",
        pollCursor: null,
      }),
    }));
    expect(mocks.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: [expect.objectContaining({
        sessionId: "session-1",
        externalTransactionId: "107097889480042413",
      })],
    }));
  });

  it("does not report a lost commit lease as a worker failure", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.txUpdateMany.mockResolvedValueOnce({ count: 0 });
    mocks.poll.mockResolvedValueOnce({
      status: "ok",
      page: {
        account: {
          merchantId: "22669496",
          storeId: "23556014",
          fingerprint: "a".repeat(64),
        },
        transactions: [],
        nextPosition: "",
        skippedCount: 0,
      },
    });

    await expect(pollActiveShopeePartnerSessions(NOW)).resolves.toMatchObject({
      leased: 1,
      pages: 1,
      errors: 0,
    });
  });

  it("does not persist when the upstream account changes mid-poll", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 1 });
    mocks.poll.mockResolvedValue({
      status: "account_mismatch",
      detail: "SESSION_MERCHANT_IDENTITY_CHANGED",
    });
    const result = await pollActiveShopeePartnerSessions(NOW);
    expect(result.accountMismatch).toBe(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      status: "ERROR",
      lastErrorCode: "ACCOUNT_MISMATCH",
    });
  });
});
