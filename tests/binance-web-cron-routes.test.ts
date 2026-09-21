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
vi.mock("@/server/payment/binance-web-worker", () => ({
  pollBinanceWebSessions: mocks.poll,
}));
vi.mock("@/server/payment/binance-web-matching", () => ({
  processPendingBinanceWebPayments: mocks.match,
}));

import { POST as pollPost } from "@/app/api/cron/payments/binance-web/route";
import { POST as matchPost } from "@/app/api/cron/payments/binance-web/match/route";

function request(path: string) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: { authorization: "Bearer test" },
  });
}

describe("Binance web cron routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects both workers before invocation when cron auth fails", async () => {
    mocks.verifyCronAuthorization.mockReturnValue(false);
    expect((await pollPost(request("/api/cron/payments/binance-web"))).status).toBe(401);
    expect((await matchPost(request("/api/cron/payments/binance-web/match"))).status).toBe(401);
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.match).not.toHaveBeenCalled();
  });

  it("keeps polling and matching as separate authenticated jobs", async () => {
    mocks.verifyCronAuthorization.mockReturnValue(true);
    mocks.poll.mockResolvedValue({ sessions: 1, leased: 1, pages: 1, received: 2 });
    mocks.match.mockResolvedValue({ scanned: 1, matched: 1, confirmed: 0 });
    await expect((await pollPost(request("/api/cron/payments/binance-web"))).json())
      .resolves.toMatchObject({ ok: true, sessions: 1, received: 2 });
    await expect((await matchPost(request("/api/cron/payments/binance-web/match"))).json())
      .resolves.toMatchObject({ ok: true, scanned: 1, matched: 1 });
  });
});
