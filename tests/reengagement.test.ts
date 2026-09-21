import { describe, expect, it } from "vitest";
import { reengagementDedupeKey } from "@/server/telegram/delivery-key";
import {
  DEFAULT_REENGAGEMENT_BUYER_MESSAGE,
  DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE,
  evaluateReengagementCandidate,
} from "@/server/telegram/reengagement";

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date("2026-08-24T12:00:00.000Z");
const settings = {
  buyerInactiveDays: 30,
  nonBuyerInactiveDays: 7,
  cooldownDays: 14,
  maxMessages: 3,
};

describe("Telegram re-engagement policy", () => {
  it("targets a never-buyer after the shorter inactivity threshold", () => {
    expect(
      evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: new Date(now.getTime() - 8 * DAY_MS),
          lastPurchaseAt: null,
          lastQueuedAt: null,
          sequence: 0,
        },
        settings,
        now,
      }),
    ).toBe("non_buyer");
  });

  it("uses both last purchase and recent chat activity for an existing buyer", () => {
    expect(
      evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: new Date(now.getTime() - 2 * DAY_MS),
          lastPurchaseAt: new Date(now.getTime() - 45 * DAY_MS),
          lastQueuedAt: null,
          sequence: 0,
        },
        settings,
        now,
      }),
    ).toBeNull();
    expect(
      evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: new Date(now.getTime() - 31 * DAY_MS),
          lastPurchaseAt: new Date(now.getTime() - 45 * DAY_MS),
          lastQueuedAt: null,
          sequence: 0,
        },
        settings,
        now,
      }),
    ).toBe("buyer");
  });

  it("enforces cooldown and the maximum messages per inactivity episode", () => {
    expect(
      evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: new Date(now.getTime() - 60 * DAY_MS),
          lastPurchaseAt: null,
          lastQueuedAt: new Date(now.getTime() - 13 * DAY_MS),
          sequence: 1,
        },
        settings,
        now,
      }),
    ).toBeNull();
    expect(
      evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: new Date(now.getTime() - 60 * DAY_MS),
          lastPurchaseAt: null,
          lastQueuedAt: new Date(now.getTime() - 20 * DAY_MS),
          sequence: 3,
        },
        settings,
        now,
      }),
    ).toBeNull();
  });

  it("uses stable per-episode dedupe keys", () => {
    const lastInboundAt = new Date("2026-07-01T10:00:00.000Z");
    expect(reengagementDedupeKey("7398144015", lastInboundAt, 1)).toBe(
      `reengagement:7398144015:${lastInboundAt.getTime()}:1`,
    );
    expect(reengagementDedupeKey("7398144015", lastInboundAt, 1)).not.toBe(
      reengagementDedupeKey("7398144015", lastInboundAt, 2),
    );
  });

  it("uses safe Unicode brand icons in both default messages", () => {
    expect(DEFAULT_REENGAGEMENT_BUYER_MESSAGE).toContain("🤖 ChatGPT");
    expect(DEFAULT_REENGAGEMENT_BUYER_MESSAGE).toContain("🧠 Claude");
    expect(DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE).toContain("🤖 ChatGPT");
    expect(DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE).toContain("🧠 Claude");
  });
});
