import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSessions: vi.fn(),
  updateSessions: vi.fn(),
  readCredentials: vi.fn(),
  pollHistory: vi.fn(),
  recordMetric: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    binanceWebSession: {
      findMany: mocks.findSessions,
      updateMany: mocks.updateSessions,
    },
  },
}));
vi.mock("@/server/payment/binance-web-session", () => ({
  binanceWebAccountFingerprint: () => "a".repeat(64),
  classifyBinanceWebAccountProof: () => "PROVEN",
  readBinanceWebSessionCredentials: mocks.readCredentials,
}));
vi.mock("@/server/payment/binance-web-poller", () => ({
  pollBinanceWebAccountIdentity: vi.fn(),
  pollBinanceWebDetail: vi.fn(),
  pollBinanceWebHistory: mocks.pollHistory,
}));
vi.mock("@/server/payment/binance-web-metrics", () => ({
  pruneBinanceWebPollMetrics: vi.fn(),
  recordBinanceWebPollMetric: mocks.recordMetric,
}));

import { pollBinanceWebSessions } from "@/server/payment/binance-web-worker";

const session = {
  id: "session-1",
  status: "ACTIVE",
  isPrimary: true,
  recipientBinanceId: "567896636",
  accountFingerprint: "a".repeat(64),
};

describe("Binance web worker metric recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findSessions.mockResolvedValue([session]);
    mocks.updateSessions.mockResolvedValue({ count: 1 });
    mocks.readCredentials.mockResolvedValue({
      cookies: [{ domain: "binance.com", name: "test", path: "/", value: "redacted" }],
    });
    mocks.pollHistory.mockResolvedValue({
      status: "unauthorized",
      detail: "HTTP_401",
    });
    mocks.recordMetric.mockResolvedValue({ id: "metric-1" });
  });

  it("persists one failed metric for an authenticated session poll", async () => {
    const now = new Date("2026-09-08T10:07:00.000Z");
    await expect(pollBinanceWebSessions({ now })).resolves.toMatchObject({
      sessions: 1,
      leased: 1,
      unauthorized: 1,
      errors: 0,
    });
    expect(mocks.recordMetric).toHaveBeenCalledWith({
      sessionId: "session-1",
      counters: {
        pages: 0,
        received: 0,
        detailCalls: 0,
        unauthorized: 1,
        rateLimited: 0,
        challenged: 0,
        contractUnknown: 0,
        accountMismatch: 0,
        identityUnproven: 0,
        errors: 0,
      },
      now,
    });
  });

  it("does not count a cron overlap that could not obtain the session lease", async () => {
    mocks.updateSessions.mockResolvedValueOnce({ count: 0 });
    await pollBinanceWebSessions();
    expect(mocks.recordMetric).not.toHaveBeenCalled();
    expect(mocks.pollHistory).not.toHaveBeenCalled();
  });
});
