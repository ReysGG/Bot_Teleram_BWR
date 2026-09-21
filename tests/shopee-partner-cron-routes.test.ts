import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuthorization: vi.fn(),
  poll: vi.fn(),
  match: vi.fn(),
}));

vi.mock("@/server/security/cron", () => ({
  verifyCronAuthorization: mocks.verifyCronAuthorization,
}));

vi.mock("@/server/payment/shopee-partner-worker", () => ({
  pollActiveShopeePartnerSessions: mocks.poll,
}));

vi.mock("@/server/payment/shopee-partner-payment-worker", () => ({
  processPendingShopeePartnerPayments: mocks.match,
}));

import { GET as pollGet, POST as pollPost } from "@/app/api/cron/payments/shopee/route";
import { GET as matchGet, POST as matchPost } from "@/app/api/cron/payments/shopee/match/route";

function request(path: string) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: { authorization: "Bearer cron-test" },
  });
}

describe("Shopee Partner cron routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects both routes before invoking a worker when cron auth fails", async () => {
    mocks.verifyCronAuthorization.mockReturnValue(false);

    const pollResponse = await pollPost(request("/api/cron/payments/shopee"));
    const matchResponse = await matchPost(request("/api/cron/payments/shopee/match"));

    expect(pollResponse.status).toBe(401);
    expect(matchResponse.status).toBe(401);
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.match).not.toHaveBeenCalled();
  });

  it("keeps polling and matching on separate authenticated routes", async () => {
    mocks.verifyCronAuthorization.mockReturnValue(true);
    const pollResult = { sessions: 1, leased: 1, pages: 2, received: 3 };
    const matchResult = { scanned: 3, matched: 1, unmatched: 1, ambiguous: 1, confirmed: 0, rejected: 0, errors: 0, autoConfirmEnabled: false };
    mocks.poll.mockResolvedValue(pollResult);
    mocks.match.mockResolvedValue(matchResult);

    const [pollPostResponse, pollGetResponse, matchPostResponse, matchGetResponse] = await Promise.all([
      pollPost(request("/api/cron/payments/shopee")),
      pollGet(request("/api/cron/payments/shopee")),
      matchPost(request("/api/cron/payments/shopee/match")),
      matchGet(request("/api/cron/payments/shopee/match")),
    ]);

    await expect(pollPostResponse.json()).resolves.toEqual({ ok: true, ...pollResult });
    await expect(pollGetResponse.json()).resolves.toEqual({ ok: true, ...pollResult });
    await expect(matchPostResponse.json()).resolves.toEqual({ ok: true, ...matchResult });
    await expect(matchGetResponse.json()).resolves.toEqual({ ok: true, ...matchResult });
    expect(mocks.poll).toHaveBeenCalledTimes(2);
    expect(mocks.match).toHaveBeenCalledTimes(2);
  });
});
