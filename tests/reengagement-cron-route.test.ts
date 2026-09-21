import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuthorization: vi.fn(),
  queueReengagementBatch: vi.fn(),
}));

vi.mock("@/server/security/cron", () => ({
  verifyCronAuthorization: mocks.verifyCronAuthorization,
}));

vi.mock("@/server/telegram/reengagement", () => ({
  queueReengagementBatch: mocks.queueReengagementBatch,
}));

import { GET, POST } from "@/app/api/cron/reengagement/route";

function request() {
  return new NextRequest("https://store.example/api/cron/reengagement", {
    method: "POST",
    headers: { authorization: "Bearer cron-test" },
  });
}

describe("re-engagement cron route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects an invalid cron bearer token before queueing", async () => {
    mocks.verifyCronAuthorization.mockReturnValue(false);

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.queueReengagementBatch).not.toHaveBeenCalled();
  });

  it("queues one bounded batch for authenticated POST and GET calls", async () => {
    const result = {
      enabled: true,
      scanned: 10,
      queued: 3,
      buyers: 1,
      nonBuyers: 2,
    };
    mocks.verifyCronAuthorization.mockReturnValue(true);
    mocks.queueReengagementBatch.mockResolvedValue(result);

    const postResponse = await POST(request());
    const getResponse = await GET(request());

    await expect(postResponse.json()).resolves.toEqual({ ok: true, data: result });
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: result });
    expect(mocks.queueReengagementBatch).toHaveBeenCalledTimes(2);
  });
});
