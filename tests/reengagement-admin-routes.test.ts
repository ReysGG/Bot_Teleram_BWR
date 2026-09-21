import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertAdminOrigin: vi.fn(),
  requireAdminRequest: vi.fn(() => ({ email: "owner@example.test" })),
  setReengagementSettings: vi.fn(),
  queueReengagementBatch: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  appRoute: (path: string) => `https://store.example${path}`,
}));

vi.mock("@/server/security/admin-auth", () => ({
  assertAdminOrigin: mocks.assertAdminOrigin,
  requireAdminRequest: mocks.requireAdminRequest,
}));

vi.mock("@/server/telegram/reengagement", () => ({
  setReengagementSettings: mocks.setReengagementSettings,
  queueReengagementBatch: mocks.queueReengagementBatch,
}));

import { POST as saveSettings } from "@/app/api/admin/broadcasts/reengagement/settings/route";
import { POST as runNow } from "@/app/api/admin/broadcasts/reengagement/run-now/route";

function post(path: string, body?: URLSearchParams) {
  return new NextRequest(`https://store.example${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://store.example",
    },
    body,
  });
}

describe("reengagement admin routes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists validated settings with explicit audience acknowledgement", async () => {
    const response = await saveSettings(post(
      "/api/admin/broadcasts/reengagement/settings",
      new URLSearchParams({
        enabled: "true",
        buyerInactiveDays: "30",
        nonBuyerInactiveDays: "7",
        cooldownDays: "14",
        maxMessages: "3",
        batchSize: "50",
        buyerMessage: "Pesan pembeli lama",
        nonBuyerMessage: "Pesan user baru",
        audienceAcknowledged: "true",
      }),
    ));

    expect(mocks.setReengagementSettings).toHaveBeenCalledWith({
      enabled: true,
      buyerInactiveDays: 30,
      nonBuyerInactiveDays: 7,
      cooldownDays: 14,
      maxMessages: 3,
      batchSize: 50,
      buyerMessage: "Pesan pembeli lama",
      nonBuyerMessage: "Pesan user baru",
      actor: "admin:owner@example.test",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts/reengagement?notice=settings-saved",
    );
  });

  it("rejects settings when the broad audience is not acknowledged", async () => {
    const response = await saveSettings(post(
      "/api/admin/broadcasts/reengagement/settings",
      new URLSearchParams({
        enabled: "true",
        buyerInactiveDays: "30",
        nonBuyerInactiveDays: "7",
        cooldownDays: "14",
        maxMessages: "3",
        batchSize: "50",
        buyerMessage: "Pesan pembeli lama",
        nonBuyerMessage: "Pesan user baru",
        audienceAcknowledged: "false",
      }),
    ));

    expect(mocks.setReengagementSettings).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts/reengagement?error=audience-ack",
    );
  });

  it("queues one idempotent service batch and returns the result counts", async () => {
    mocks.queueReengagementBatch.mockResolvedValueOnce({
      enabled: true,
      scanned: 20,
      queued: 7,
      buyers: 4,
      nonBuyers: 3,
    });
    const response = await runNow(post("/api/admin/broadcasts/reengagement/run-now"));

    expect(mocks.queueReengagementBatch).toHaveBeenCalledTimes(1);
    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts/reengagement?notice=batch-queued&queued=7&buyers=4&nonBuyers=3",
    );
  });

  it("does not run when the stored automation is disabled", async () => {
    mocks.queueReengagementBatch.mockResolvedValueOnce({
      enabled: false,
      scanned: 0,
      queued: 0,
      buyers: 0,
      nonBuyers: 0,
    });
    const response = await runNow(post("/api/admin/broadcasts/reengagement/run-now"));

    expect(response.headers.get("location")).toBe(
      "https://store.example/admin/broadcasts/reengagement?error=disabled",
    );
  });
});
