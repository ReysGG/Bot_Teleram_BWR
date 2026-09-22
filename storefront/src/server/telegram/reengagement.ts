import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { adminChatIds } from "@/server/env";
import { TELEGRAM_ADMIN_ID } from "@/server/telegram/constants";
import { reengagementDedupeKey } from "@/server/telegram/delivery-key";

const STORE_RUNTIME_ID = "global";
const REENGAGEMENT_LOCK = "telegram_reengagement_queue";
const MAX_CANDIDATE_SCAN = 1_000;

export const DEFAULT_REENGAGEMENT_BUYER_MESSAGE = [
  "👋 Udah lama nih kamu nggak belanja di BWR Tele.",
  "",
  "🤖 ChatGPT, 🧠 Claude, dan produk digital lainnya mungkin sudah punya pilihan baru.",
  "Yuk, explore katalog dulu. Siapa tahu ada yang pas buat kamu ✨",
].join("\n");

export const DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE = [
  "👋 Masih cari produk digital yang pas?",
  "",
  "🤖 ChatGPT, 🧠 Claude, API, dan kebutuhan AI lainnya tersedia di BWR Tele.",
  "Coba explore katalog dulu. Pilih produknya gampang dan pengiriman otomatis 🚀",
].join("\n");

export type ReengagementSettings = {
  enabled: boolean;
  buyerInactiveDays: number;
  nonBuyerInactiveDays: number;
  cooldownDays: number;
  maxMessages: number;
  batchSize: number;
  buyerMessage: string;
  nonBuyerMessage: string;
  updatedAt: Date | null;
  updatedBy: string | null;
};

export type ReengagementCandidate = {
  lastInboundAt: Date;
  lastPurchaseAt: Date | null;
  lastQueuedAt: Date | null;
  sequence: number;
};

export function evaluateReengagementCandidate(input: {
  candidate: ReengagementCandidate;
  settings: Pick<
    ReengagementSettings,
    | "buyerInactiveDays"
    | "nonBuyerInactiveDays"
    | "cooldownDays"
    | "maxMessages"
  >;
  now: Date;
}) {
  const { candidate, settings, now } = input;
  if (candidate.sequence >= settings.maxMessages) return null;
  if (
    candidate.lastQueuedAt &&
    candidate.lastQueuedAt.getTime() >
      now.getTime() - settings.cooldownDays * 24 * 60 * 60 * 1000
  ) {
    return null;
  }

  const buyer = candidate.lastPurchaseAt !== null;
  const inactivityDays = buyer
    ? settings.buyerInactiveDays
    : settings.nonBuyerInactiveDays;
  const referenceAt = buyer && candidate.lastPurchaseAt
    ? new Date(
        Math.max(
          candidate.lastInboundAt.getTime(),
          candidate.lastPurchaseAt.getTime(),
        ),
      )
    : candidate.lastInboundAt;
  if (
    referenceAt.getTime() >
    now.getTime() - inactivityDays * 24 * 60 * 60 * 1000
  ) {
    return null;
  }
  return buyer ? ("buyer" as const) : ("non_buyer" as const);
}

function boundedInteger(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function settingsFromRow(
  row: Awaited<ReturnType<typeof prisma.storeRuntimeSetting.findUnique>>,
): ReengagementSettings {
  return {
    enabled: row?.reengagementEnabled ?? false,
    buyerInactiveDays: row?.reengagementBuyerInactiveDays ?? 30,
    nonBuyerInactiveDays: row?.reengagementNonBuyerInactiveDays ?? 7,
    cooldownDays: row?.reengagementCooldownDays ?? 14,
    maxMessages: row?.reengagementMaxMessages ?? 3,
    batchSize: row?.reengagementBatchSize ?? 50,
    buyerMessage:
      row?.reengagementBuyerMessage?.trim() ||
      DEFAULT_REENGAGEMENT_BUYER_MESSAGE,
    nonBuyerMessage:
      row?.reengagementNonBuyerMessage?.trim() ||
      DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE,
    updatedAt: row?.reengagementUpdatedAt ?? null,
    updatedBy: row?.reengagementUpdatedBy ?? null,
  };
}

type ReengagementClient = Pick<
  Prisma.TransactionClient,
  "storeRuntimeSetting"
>;

export async function getReengagementSettings(
  client: ReengagementClient = prisma,
) {
  return settingsFromRow(
    await client.storeRuntimeSetting.findUnique({
      where: { id: STORE_RUNTIME_ID },
    }),
  );
}

export async function setReengagementSettings(input: {
  enabled: boolean;
  buyerInactiveDays: number;
  nonBuyerInactiveDays: number;
  cooldownDays: number;
  maxMessages: number;
  batchSize: number;
  buyerMessage?: string | null;
  nonBuyerMessage?: string | null;
  actor: string;
}) {
  const updatedAt = new Date();
  const data = {
    reengagementEnabled: input.enabled,
    reengagementBuyerInactiveDays: boundedInteger(
      input.buyerInactiveDays,
      3,
      365,
    ),
    reengagementNonBuyerInactiveDays: boundedInteger(
      input.nonBuyerInactiveDays,
      1,
      365,
    ),
    reengagementCooldownDays: boundedInteger(input.cooldownDays, 3, 365),
    reengagementMaxMessages: boundedInteger(input.maxMessages, 1, 12),
    reengagementBatchSize: boundedInteger(input.batchSize, 1, 250),
    reengagementBuyerMessage:
      input.buyerMessage?.trim().slice(0, 2_000) || null,
    reengagementNonBuyerMessage:
      input.nonBuyerMessage?.trim().slice(0, 2_000) || null,
    reengagementUpdatedAt: updatedAt,
    reengagementUpdatedBy: input.actor,
  };
  return prisma.storeRuntimeSetting.upsert({
    where: { id: STORE_RUNTIME_ID },
    create: { id: STORE_RUNTIME_ID, ...data },
    update: data,
  });
}

function latestDate(current: Date | undefined, candidate: Date | null) {
  if (!candidate) return current;
  if (!current || candidate.getTime() > current.getTime()) return candidate;
  return current;
}

export async function queueReengagementBatch(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(hashtext('${REENGAGEMENT_LOCK}'))`,
    );
    const settings = await getReengagementSettings(tx);
    if (!settings.enabled) {
      return { enabled: false, scanned: 0, queued: 0, buyers: 0, nonBuyers: 0 };
    }

    const earliestInactiveDays = Math.min(
      settings.buyerInactiveDays,
      settings.nonBuyerInactiveDays,
    );
    const inactivityCutoff = new Date(
      now.getTime() - earliestInactiveDays * 24 * 60 * 60 * 1000,
    );
    const cooldownCutoff = new Date(
      now.getTime() - settings.cooldownDays * 24 * 60 * 60 * 1000,
    );
    const scanLimit = Math.min(
      MAX_CANDIDATE_SCAN,
      Math.max(settings.batchSize * 10, settings.batchSize),
    );
    const excludedAdminChatIds = [
      ...new Set([...adminChatIds(), TELEGRAM_ADMIN_ID]),
    ];
    const candidates = await tx.botSession.findMany({
      where: {
        telegramReachable: true,
        ...(excludedAdminChatIds.length > 0
          ? { chatId: { notIn: excludedAdminChatIds } }
          : {}),
        lastInboundAt: { lte: inactivityCutoff },
        reengagementSequence: { lt: settings.maxMessages },
        OR: [
          { reengagementLastQueuedAt: null },
          { reengagementLastQueuedAt: { lte: cooldownCutoff } },
        ],
      },
      orderBy: [{ lastInboundAt: "asc" }, { chatId: "asc" }],
      take: scanLimit,
      select: {
        chatId: true,
        createdAt: true,
        lastInboundAt: true,
        reengagementLastQueuedAt: true,
        reengagementSequence: true,
      },
    });
    if (candidates.length === 0) {
      return { enabled: true, scanned: 0, queued: 0, buyers: 0, nonBuyers: 0 };
    }

    const chatIds = candidates.map((candidate) => candidate.chatId);
    const [orderPurchases, smsPurchases, activeOrders, activeTopups, activeSms, operationalNotifications] =
      await Promise.all([
        tx.order.groupBy({
          by: ["chatId"],
          where: {
            chatId: { in: chatIds },
            paymentStatus: "PAID",
            paidAt: { not: null },
            status: { notIn: ["CANCELLED", "REFUNDED"] },
          },
          _max: { paidAt: true },
        }),
        tx.smsPoolCustomerOrder.groupBy({
          by: ["chatId"],
          where: {
            chatId: { in: chatIds },
            status: "COMPLETED",
            completedAt: { not: null },
          },
          _max: { completedAt: true },
        }),
        tx.order.findMany({
          where: {
            chatId: { in: chatIds },
            status: {
              in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK", "PAID", "FULFILLING"],
            },
          },
          select: { chatId: true },
          distinct: ["chatId"],
        }),
        tx.walletTopup.findMany({
          where: { chatId: { in: chatIds }, status: "PENDING" },
          select: { chatId: true },
          distinct: ["chatId"],
        }),
        tx.smsPoolCustomerOrder.findMany({
          where: {
            chatId: { in: chatIds },
            status: { in: ["PROCESSING", "ACTIVE"] },
          },
          select: { chatId: true },
          distinct: ["chatId"],
        }),
        tx.telegramNotification.findMany({
          where: {
            chatId: { in: chatIds },
            status: { in: ["PENDING", "PROCESSING"] },
            kind: { not: "REENGAGEMENT" },
          },
          select: { chatId: true },
          distinct: ["chatId"],
        }),
      ]);

    const purchases = new Map<string, Date>();
    orderPurchases.forEach((row) => {
      const latest = latestDate(purchases.get(row.chatId), row._max.paidAt);
      if (latest) purchases.set(row.chatId, latest);
    });
    smsPurchases.forEach((row) => {
      const latest = latestDate(purchases.get(row.chatId), row._max.completedAt);
      if (latest) purchases.set(row.chatId, latest);
    });
    const busyChats = new Set([
      ...activeOrders.map((row) => row.chatId),
      ...activeTopups.map((row) => row.chatId),
      ...activeSms.map((row) => row.chatId),
      ...operationalNotifications.map((row) => row.chatId),
    ]);

    let queued = 0;
    let buyers = 0;
    let nonBuyers = 0;
    for (const candidate of candidates) {
      if (queued >= settings.batchSize) break;
      if (busyChats.has(candidate.chatId)) continue;
      const audience = evaluateReengagementCandidate({
        candidate: {
          lastInboundAt: candidate.lastInboundAt,
          lastPurchaseAt: purchases.get(candidate.chatId) ?? null,
          lastQueuedAt: candidate.reengagementLastQueuedAt,
          sequence: candidate.reengagementSequence,
        },
        settings,
        now,
      });
      if (!audience) continue;

      const nextSequence = candidate.reengagementSequence + 1;
      const claimed = await tx.botSession.updateMany({
        where: {
          chatId: candidate.chatId,
          telegramReachable: true,
          lastInboundAt: candidate.lastInboundAt,
          reengagementSequence: candidate.reengagementSequence,
        },
        data: {
          reengagementLastQueuedAt: now,
          reengagementSequence: nextSequence,
        },
      });
      if (claimed.count !== 1) continue;
      await tx.telegramNotification.create({
        data: {
          dedupeKey: reengagementDedupeKey(
            candidate.chatId,
            candidate.lastInboundAt,
            nextSequence,
          ),
          chatId: candidate.chatId,
          kind: "REENGAGEMENT",
          messageText:
            audience === "buyer"
              ? settings.buyerMessage
              : settings.nonBuyerMessage,
          priority: 140,
        },
      });
      queued += 1;
      if (audience === "buyer") buyers += 1;
      else nonBuyers += 1;
    }

    return {
      enabled: true,
      scanned: candidates.length,
      queued,
      buyers,
      nonBuyers,
    };
  });
}

export async function getReengagementDeliveryStats() {
  const [settings, grouped, latestSentAt, totalUsers] = await Promise.all([
    getReengagementSettings(),
    prisma.telegramNotification.groupBy({
      by: ["status"],
      where: { kind: "REENGAGEMENT" },
      _count: { _all: true },
    }),
    prisma.telegramNotification.findFirst({
      where: { kind: "REENGAGEMENT", status: "SENT" },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true },
    }),
    prisma.botSession.count({ where: { telegramReachable: true } }),
  ]);
  const counts = new Map(
    grouped.map((row) => [row.status, row._count._all] as const),
  );
  return {
    settings,
    totalUsers,
    queued: (counts.get("PENDING") ?? 0) + (counts.get("PROCESSING") ?? 0),
    sent: counts.get("SENT") ?? 0,
    failed: (counts.get("FAILED") ?? 0) + (counts.get("MANUAL_REVIEW") ?? 0),
    latestSentAt: latestSentAt?.sentAt ?? null,
  };
}
