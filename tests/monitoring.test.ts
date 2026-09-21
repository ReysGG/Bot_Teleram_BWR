import { describe, expect, it } from "vitest";
import {
  evaluateStoreHealth,
  planProactiveAdminAlerts,
  systemAlertDedupeKey,
  systemAlertDedupePrefix,
  type StoreHealthMetrics,
} from "@/server/monitoring/store-health";

const now = new Date("2026-08-11T12:00:00.000Z");

function healthyMetrics(
  overrides: Partial<StoreHealthMetrics> = {},
): StoreHealthMetrics {
  return {
    bridgeLastSeenAt: new Date(now.getTime() - 60_000),
    bridgeQueueSize: 0,
    bridgePendingQueueSize: 0,
    bridgeBlockedQueueSize: 0,
    bridgeOldestQueuedAt: null,
    bridgeHighestAttemptCount: 0,
    bridgeLastErrorCode: null,
    bridgeAppVersion: "1.0.0",
    bridgeListenerConnected: true,
    failedNotifications: 0,
    manualReviewNotifications: 0,
    pendingNotifications: 0,
    oldestPendingNotificationAt: null,
    failedDeliveries: 0,
    unknownDeliveries: 0,
    rejectedPaymentEventsLastHour: 0,
    expiredPendingOrders: 0,
    expiredPendingTopups: 0,
    unhealthyAvailableStock: 0,
    ...overrides,
  };
}

describe("store monitoring", () => {
  it("reports healthy when workers and bridge are current", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics(), now);
    expect(snapshot.severity).toBe("healthy");
    expect(snapshot.issues).toEqual([]);
  });

  it("raises a critical alert for a stale bridge", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      bridgeLastSeenAt: new Date(now.getTime() - 11 * 60_000),
    }), now);
    expect(snapshot.severity).toBe("critical");
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "bridge-stale",
      notify: true,
    }));
  });

  it("does not suggest an automatic retry for ambiguous deliveries", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      manualReviewNotifications: 1,
      unknownDeliveries: 1,
    }), now);
    const issue = snapshot.issues.find((item) => item.code === "delivery-ambiguous");
    expect(issue?.severity).toBe("critical");
    expect(issue?.detail).toContain("Jangan retry otomatis");
  });

  it("raises a critical alert when Android reports blocked rows", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      bridgeQueueSize: 2,
      bridgeBlockedQueueSize: 2,
      bridgeLastErrorCode: "HTTP_400",
    }), now);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "bridge-blocked",
      severity: "critical",
    }));
  });

  it("detects delayed notification workers", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      pendingNotifications: 12,
      oldestPendingNotificationAt: new Date(now.getTime() - 12 * 60_000),
    }), now);
    expect(snapshot.issues).toContainEqual(expect.objectContaining({
      code: "outbox-backlog",
      severity: "critical",
      notify: true,
    }));
  });

  it("aggregates multiple due alarms into one admin message", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      bridgeLastSeenAt: new Date(now.getTime() - 11 * 60_000),
      failedDeliveries: 2,
    }), now);
    const plans = planProactiveAdminAlerts(snapshot, ["7398144015"], []);

    expect(plans).toHaveLength(1);
    expect(plans[0]?.markerKeys).toHaveLength(1);
    expect(plans[0]?.messageText).toContain("DANA Bridge tidak aktif");
    expect(plans[0]?.messageText).toContain("Pengiriman digital gagal");
  });

  it("does not queue an already alerted issue again inside its cooldown", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({ failedDeliveries: 1 }), now);
    const issue = snapshot.issues.find((item) => item.code === "delivery-failed");
    expect(issue).toBeDefined();
    const key = systemAlertDedupeKey(issue!, "7398144015", now);

    expect(planProactiveAdminAlerts(snapshot, ["7398144015"], [{
      dedupeKey: key,
      createdAt: now,
    }]))
      .toEqual([]);
  });

  it("alerts a distinct critical issue even when another alarm is cooling down", () => {
    const snapshot = evaluateStoreHealth(healthyMetrics({
      bridgeLastSeenAt: new Date(now.getTime() - 11 * 60_000),
      failedDeliveries: 1,
    }), now);
    const bridgeIssue = snapshot.issues.find((item) => item.code === "bridge-stale");
    expect(bridgeIssue).toBeDefined();
    const bridgeKey = systemAlertDedupeKey(bridgeIssue!, "7398144015", now);
    const plans = planProactiveAdminAlerts(
      snapshot,
      ["7398144015"],
      [{ dedupeKey: bridgeKey, createdAt: now }],
    );

    expect(plans).toHaveLength(1);
    expect(plans[0]?.messageText).not.toContain("DANA Bridge tidak aktif");
    expect(plans[0]?.messageText).toContain("Pengiriman digital gagal");
  });

  it("uses rolling cooldowns for warning and critical alarms", () => {
    const warning = {
      code: "warning",
      severity: "warning" as const,
      title: "Warning",
      detail: "Warning detail",
      href: "/admin/monitoring",
      notify: true,
    };
    const critical = { ...warning, code: "critical", severity: "critical" as const };
    const fiveHoursLater = new Date(now.getTime() + 5 * 60 * 60_000);
    const sevenHoursLater = new Date(now.getTime() + 7 * 60 * 60_000);

    const warningSnapshot = {
      generatedAt: sevenHoursLater,
      severity: "warning" as const,
      metrics: healthyMetrics(),
      issues: [warning],
    };
    const criticalAtFiveHours = {
      ...warningSnapshot,
      generatedAt: fiveHoursLater,
      severity: "critical" as const,
      issues: [critical],
    };
    const criticalAtSevenHours = {
      ...criticalAtFiveHours,
      generatedAt: sevenHoursLater,
    };
    const warningRecord = [{
      dedupeKey: systemAlertDedupeKey(warning, "1", now),
      createdAt: now,
    }];
    const criticalRecord = [{
      dedupeKey: systemAlertDedupeKey(critical, "1", now),
      createdAt: now,
    }];

    expect(planProactiveAdminAlerts(warningSnapshot, ["1"], warningRecord)).toEqual([]);
    expect(planProactiveAdminAlerts(criticalAtFiveHours, ["1"], criticalRecord))
      .toEqual([]);
    expect(planProactiveAdminAlerts(criticalAtSevenHours, ["1"], criticalRecord))
      .toHaveLength(1);
  });

  it("does not resend one minute later across an old epoch-bucket boundary", () => {
    const issue = {
      code: "bridge-stale",
      severity: "critical" as const,
      title: "DANA Bridge tidak aktif",
      detail: "Heartbeat terlambat.",
      href: "/admin/monitoring",
      notify: true,
    };
    const firstAlertAt = new Date("2026-08-11T17:59:30.000Z");
    const nextCronAt = new Date("2026-08-11T18:00:30.000Z");
    const snapshot = {
      generatedAt: nextCronAt,
      severity: "critical" as const,
      metrics: healthyMetrics(),
      issues: [issue],
    };

    expect(systemAlertDedupePrefix(issue, "1"))
      .toBe("system-alert:bridge-stale:critical:1:");
    expect(planProactiveAdminAlerts(snapshot, ["1"], [{
      dedupeKey: systemAlertDedupeKey(issue, "1", firstAlertAt),
      createdAt: firstAlertAt,
    }])).toEqual([]);
  });

  it("uses one deterministic key for overlapping cron runs", () => {
    const issue = {
      code: "delivery-failed",
      severity: "critical" as const,
      title: "Pengiriman digital gagal",
      detail: "Butuh pemeriksaan admin.",
      href: "/admin/deliveries",
      notify: true,
    };

    expect(systemAlertDedupeKey(issue, "1", now)).toBe(
      systemAlertDedupeKey(issue, "1", new Date(now.getTime() + 1_000)),
    );
  });
});
