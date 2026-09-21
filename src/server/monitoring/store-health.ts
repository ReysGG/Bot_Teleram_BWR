import { prisma } from "@/server/db/prisma";
import { adminChatIds } from "@/server/env";

const BRIDGE_STALE_MS = 10 * 60_000;
const OUTBOX_WARNING_MS = 2 * 60_000;
const OUTBOX_CRITICAL_MS = 10 * 60_000;
const CRITICAL_ALERT_COOLDOWN_MS = 6 * 60 * 60_000;
const WARNING_ALERT_COOLDOWN_MS = 24 * 60 * 60_000;
const HEALTH_EXCLUDED_NOTIFICATION_KINDS = [
  "PRODUCT_RESTOCK",
  "PRODUCT_SOLD_OUT",
  "PRODUCT_ANNOUNCEMENT",
  "ADMIN_BROADCAST",
  // A failed system alarm must never create another system alarm about itself.
  "SYSTEM_ALERT",
  "SYSTEM_ALERT_MARKER",
] as const;

export type StoreHealthSeverity = "healthy" | "warning" | "critical";

export type StoreHealthIssue = {
  code: string;
  severity: Exclude<StoreHealthSeverity, "healthy">;
  title: string;
  detail: string;
  href: string;
  notify: boolean;
};

export type StoreHealthMetrics = {
  bridgeLastSeenAt: Date | null;
  bridgeQueueSize: number;
  bridgePendingQueueSize: number;
  bridgeBlockedQueueSize: number;
  bridgeOldestQueuedAt: Date | null;
  bridgeHighestAttemptCount: number;
  bridgeLastErrorCode: string | null;
  bridgeAppVersion: string | null;
  bridgeListenerConnected: boolean | null;
  failedNotifications: number;
  manualReviewNotifications: number;
  pendingNotifications: number;
  oldestPendingNotificationAt: Date | null;
  failedDeliveries: number;
  unknownDeliveries: number;
  rejectedPaymentEventsLastHour: number;
  expiredPendingOrders: number;
  expiredPendingTopups: number;
  unhealthyAvailableStock: number;
};

export type StoreHealthSnapshot = {
  generatedAt: Date;
  severity: StoreHealthSeverity;
  metrics: StoreHealthMetrics;
  issues: StoreHealthIssue[];
};

type AlertCandidate = {
  dedupeKey: string;
  issue: StoreHealthIssue;
};

export type ProactiveAdminAlertPlan = {
  chatId: string;
  dedupeKey: string;
  markerKeys: string[];
  messageText: string;
};

export type RecentSystemAlert = {
  dedupeKey: string;
  createdAt: Date;
};

function issueSeverity(issues: StoreHealthIssue[]): StoreHealthSeverity {
  if (issues.some((issue) => issue.severity === "critical")) return "critical";
  if (issues.length > 0) return "warning";
  return "healthy";
}

export function evaluateStoreHealth(
  metrics: StoreHealthMetrics,
  now = new Date(),
): StoreHealthSnapshot {
  const issues: StoreHealthIssue[] = [];
  const bridgeAgeMs = metrics.bridgeLastSeenAt
    ? now.getTime() - metrics.bridgeLastSeenAt.getTime()
    : Number.POSITIVE_INFINITY;

  if (!metrics.bridgeLastSeenAt || bridgeAgeMs > BRIDGE_STALE_MS) {
    const ageMinutes = Number.isFinite(bridgeAgeMs)
      ? Math.max(0, Math.floor(bridgeAgeMs / 60_000))
      : null;
    issues.push({
      code: "bridge-stale",
      severity: "critical",
      title: "DANA Bridge tidak aktif",
      detail: ageMinutes === null
        ? "Heartbeat Android belum pernah diterima."
        : `Heartbeat terakhir diterima ${ageMinutes} menit lalu.`,
      href: "/admin/monitoring#bridge",
      notify: true,
    });
  } else if (metrics.bridgeListenerConnected === false) {
    issues.push({
      code: "bridge-listener",
      severity: "critical",
      title: "Listener DANA terputus",
      detail: "Aplikasi masih hidup, tetapi notification listener Android belum terhubung.",
      href: "/admin/monitoring#bridge",
      notify: true,
    });
  }

  if (metrics.bridgeBlockedQueueSize > 0) {
    issues.push({
      code: "bridge-blocked",
      severity: "critical",
      title: "Event Android ditahan",
      detail: `${metrics.bridgeBlockedQueueSize} event ditahan setelah respons permanen. Periksa konfigurasi sebelum mencoba ulang.`,
      href: "/admin/monitoring#bridge",
      notify: true,
    });
  } else if (metrics.bridgeQueueSize > 0) {
    issues.push({
      code: "bridge-queue",
      severity: metrics.bridgeQueueSize >= 20 ? "critical" : "warning",
      title: "Antrean Android belum kosong",
      detail: `${metrics.bridgeQueueSize} event pembayaran masih menunggu dikirim.`,
      href: "/admin/monitoring#bridge",
      notify: true,
    });
  }

  if (metrics.manualReviewNotifications > 0 || metrics.unknownDeliveries > 0) {
    issues.push({
      code: "delivery-ambiguous",
      severity: "critical",
      title: "Kiriman membutuhkan review manual",
      detail: `${metrics.manualReviewNotifications} notifikasi dan ${metrics.unknownDeliveries} receipt memiliki hasil ambigu. Jangan retry otomatis.`,
      href: "/admin/deliveries?status=UNKNOWN",
      notify: true,
    });
  }

  if (metrics.failedDeliveries > 0) {
    issues.push({
      code: "delivery-failed",
      severity: "critical",
      title: "Pengiriman digital gagal",
      detail: `${metrics.failedDeliveries} kiriman gagal secara pasti dan perlu diperiksa.`,
      href: "/admin/deliveries?status=FAILED",
      notify: true,
    });
  }

  if (metrics.failedNotifications > 0) {
    issues.push({
      code: "notification-failed",
      severity: metrics.failedNotifications >= 5 ? "critical" : "warning",
      title: "Notifikasi Telegram gagal",
      detail: `${metrics.failedNotifications} item outbox telah kehabisan percobaan.`,
      href: "/admin/deliveries",
      notify: metrics.failedNotifications >= 5,
    });
  }

  if (metrics.oldestPendingNotificationAt) {
    const pendingAgeMs = now.getTime() - metrics.oldestPendingNotificationAt.getTime();
    if (pendingAgeMs > OUTBOX_WARNING_MS) {
      const ageMinutes = Math.max(0, Math.floor(pendingAgeMs / 60_000));
      issues.push({
        code: "outbox-backlog",
        severity: pendingAgeMs > OUTBOX_CRITICAL_MS ? "critical" : "warning",
        title: "Antrean Telegram melambat",
        detail: `${metrics.pendingNotifications} notifikasi menunggu; item tertua berusia ${ageMinutes} menit.`,
        href: "/admin/deliveries",
        notify: pendingAgeMs > OUTBOX_CRITICAL_MS,
      });
    }
  }

  if (metrics.rejectedPaymentEventsLastHour >= 3) {
    issues.push({
      code: "payment-rejected",
      severity: metrics.rejectedPaymentEventsLastHour >= 10 ? "critical" : "warning",
      title: "Event pembayaran banyak ditolak",
      detail: `${metrics.rejectedPaymentEventsLastHour} event ditolak dalam 1 jam terakhir. Periksa waktu, nominal, dan order aktif.`,
      href: "/admin/payments/reconciliation?status=REJECTED",
      notify: metrics.rejectedPaymentEventsLastHour >= 10,
    });
  }

  const expiredPending = metrics.expiredPendingOrders + metrics.expiredPendingTopups;
  if (expiredPending > 0) {
    issues.push({
      code: "expiry-backlog",
      severity: expiredPending >= 10 ? "critical" : "warning",
      title: "Expiry worker tertinggal",
      detail: `${metrics.expiredPendingOrders} order dan ${metrics.expiredPendingTopups} top up melewati batas waktu tetapi masih pending.`,
      href: "/admin/monitoring#workers",
      notify: expiredPending >= 10,
    });
  }

  if (metrics.unhealthyAvailableStock > 0) {
    issues.push({
      code: "stock-health-error",
      severity: "warning",
      title: "Pengecekan stok gagal",
      detail: `${metrics.unhealthyAvailableStock} stok tersedia memiliki status pemeriksaan ERROR.`,
      href: "/admin/inventory/available?health=ERROR",
      notify: false,
    });
  }

  return {
    generatedAt: now,
    severity: issueSeverity(issues),
    metrics,
    issues,
  };
}

export async function loadStoreHealthSnapshot(
  now = new Date(),
): Promise<StoreHealthSnapshot> {
  const oneHourAgo = new Date(now.getTime() - 60 * 60_000);
  const [
    bridge,
    failedNotifications,
    manualReviewNotifications,
    pendingNotifications,
    oldestPendingNotification,
    failedDeliveries,
    unknownDeliveries,
    rejectedPaymentEventsLastHour,
    expiredPendingOrders,
    expiredPendingTopups,
    unhealthyAvailableStock,
  ] = await Promise.all([
    prisma.bridgeDeviceStatus.findFirst({ orderBy: { lastSeenAt: "desc" } }),
    prisma.telegramNotification.count({
      where: {
        status: "FAILED",
        kind: { notIn: [...HEALTH_EXCLUDED_NOTIFICATION_KINDS] },
      },
    }),
    prisma.telegramNotification.count({ where: { status: "MANUAL_REVIEW" } }),
    prisma.telegramNotification.count({
      where: {
        status: "PENDING",
        kind: { notIn: [...HEALTH_EXCLUDED_NOTIFICATION_KINDS] },
      },
    }),
    prisma.telegramNotification.findFirst({
      where: {
        status: "PENDING",
        kind: { notIn: [...HEALTH_EXCLUDED_NOTIFICATION_KINDS] },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.sentDelivery.count({ where: { status: "FAILED" } }),
    prisma.sentDelivery.count({ where: { status: "UNKNOWN" } }),
    prisma.bridgePaymentEvent.count({
      where: { status: "REJECTED", receivedAt: { gte: oneHourAgo } },
    }),
    prisma.order.count({
      where: {
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        expiresAt: { lt: now },
      },
    }),
    prisma.walletTopup.count({
      where: { status: "PENDING", expiresAt: { lt: now } },
    }),
    prisma.digitalStockItem.count({
      where: {
        status: "AVAILABLE",
        archivedAt: null,
        healthStatus: "ERROR",
      },
    }),
  ]);

  return evaluateStoreHealth({
    bridgeLastSeenAt: bridge?.lastSeenAt ?? null,
    bridgeQueueSize: bridge?.queueSize ?? 0,
    bridgePendingQueueSize: bridge?.pendingQueueSize ?? bridge?.queueSize ?? 0,
    bridgeBlockedQueueSize: bridge?.blockedQueueSize ?? 0,
    bridgeOldestQueuedAt: bridge?.oldestQueuedAt ?? null,
    bridgeHighestAttemptCount: bridge?.highestAttemptCount ?? 0,
    bridgeLastErrorCode: bridge?.lastErrorCode ?? null,
    bridgeAppVersion: bridge?.appVersion ?? null,
    bridgeListenerConnected: bridge?.listenerConnected ?? null,
    failedNotifications,
    manualReviewNotifications,
    pendingNotifications,
    oldestPendingNotificationAt: oldestPendingNotification?.createdAt ?? null,
    failedDeliveries,
    unknownDeliveries,
    rejectedPaymentEventsLastHour,
    expiredPendingOrders,
    expiredPendingTopups,
    unhealthyAvailableStock,
  }, now);
}

export function systemAlertCooldownMs(
  severity: StoreHealthIssue["severity"],
): number {
  return severity === "critical"
    ? CRITICAL_ALERT_COOLDOWN_MS
    : WARNING_ALERT_COOLDOWN_MS;
}

export function systemAlertDedupePrefix(
  issue: StoreHealthIssue,
  chatId: string,
): string {
  return `system-alert:${issue.code}:${issue.severity}:${chatId}:`;
}

export function systemAlertDedupeKey(
  issue: StoreHealthIssue,
  chatId: string,
  now: Date,
): string {
  const bucket = Math.floor(now.getTime() / systemAlertCooldownMs(issue.severity));
  return `${systemAlertDedupePrefix(issue, chatId)}${bucket}`;
}

function alertCandidates(
  snapshot: StoreHealthSnapshot,
  chats: string[],
): Map<string, AlertCandidate[]> {
  const candidates = new Map<string, AlertCandidate[]>();
  const issues = snapshot.issues
    .filter((issue) => issue.notify)
    .sort((left, right) => left.code.localeCompare(right.code));

  for (const chatId of chats) {
    candidates.set(chatId, issues.map((issue) => ({
      issue,
      dedupeKey: systemAlertDedupeKey(issue, chatId, snapshot.generatedAt),
    })));
  }
  return candidates;
}

function alertDigest(issues: StoreHealthIssue[]): string {
  const isCritical = issues.some((issue) => issue.severity === "critical");
  const heading = isCritical ? "ALARM SISTEM" : "PERINGATAN SISTEM";
  const body = issues.map((issue, index) => [
    `${index + 1}. ${issue.title}`,
    issue.detail,
  ].join("\n")).join("\n\n");
  return `${heading}\n\n${body}\n\nBuka dashboard Monitoring untuk detail dan tindakan.`;
}

export function planProactiveAdminAlerts(
  snapshot: StoreHealthSnapshot,
  chats: string[],
  recentAlerts: readonly RecentSystemAlert[],
): ProactiveAdminAlertPlan[] {
  const plans: ProactiveAdminAlertPlan[] = [];
  for (const [chatId, candidates] of alertCandidates(snapshot, chats)) {
    const due = candidates.filter(({ issue }) => {
      const prefix = systemAlertDedupePrefix(issue, chatId);
      const cutoff = snapshot.generatedAt.getTime() - systemAlertCooldownMs(issue.severity);
      return !recentAlerts.some((alert) => (
        alert.dedupeKey.startsWith(prefix) && alert.createdAt.getTime() > cutoff
      ));
    });
    const first = due[0];
    if (!first) continue;
    plans.push({
      chatId,
      dedupeKey: first.dedupeKey,
      markerKeys: due.slice(1).map(({ dedupeKey }) => dedupeKey),
      messageText: alertDigest(due.map(({ issue }) => issue)),
    });
  }
  return plans;
}

export async function queueProactiveAdminAlerts(
  snapshot: StoreHealthSnapshot,
): Promise<number> {
  const chats = [...adminChatIds()];
  const issues = snapshot.issues.filter((issue) => issue.notify);
  if (chats.length === 0 || issues.length === 0) return 0;

  const recentAlerts = await prisma.telegramNotification.findMany({
    where: {
      kind: { in: ["SYSTEM_ALERT", "SYSTEM_ALERT_MARKER"] },
      dedupeKey: { startsWith: "system-alert:" },
      createdAt: {
        gt: new Date(snapshot.generatedAt.getTime() - WARNING_ALERT_COOLDOWN_MS),
      },
    },
    select: { dedupeKey: true, createdAt: true },
  });
  const plans = planProactiveAdminAlerts(
    snapshot,
    chats,
    recentAlerts,
  );

  let queuedAlerts = 0;
  for (const plan of plans) {
    queuedAlerts += await prisma.$transaction(async (tx) => {
      const created = await tx.telegramNotification.createMany({
        data: [{
          dedupeKey: plan.dedupeKey,
          chatId: plan.chatId,
          kind: "SYSTEM_ALERT",
          priority: 5,
          messageText: plan.messageText,
          createdAt: snapshot.generatedAt,
        }],
        skipDuplicates: true,
      });
      if (created.count === 0) return 0;

      if (plan.markerKeys.length > 0) {
        await tx.telegramNotification.createMany({
          data: plan.markerKeys.map((dedupeKey) => ({
            dedupeKey,
            chatId: plan.chatId,
            kind: "SYSTEM_ALERT_MARKER",
            priority: 5,
            status: "SENT" as const,
            sentAt: snapshot.generatedAt,
            createdAt: snapshot.generatedAt,
            messageText: `Digabungkan ke ${plan.dedupeKey}`,
          })),
          skipDuplicates: true,
        });
      }
      return 1;
    });
  }
  return queuedAlerts;
}
