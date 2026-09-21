import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  DEFAULT_REENGAGEMENT_BUYER_MESSAGE,
  DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE,
  queueReengagementBatch,
  setReengagementSettings,
} from "@/server/telegram/reengagement";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const suffix = randomUUID();
const chatIds = {
  optOutNonBuyer: `reengagement-optout-${suffix}`,
  buyer: `reengagement-buyer-${suffix}`,
  recent: `reengagement-recent-${suffix}`,
  unreachable: `reengagement-unreachable-${suffix}`,
  activeOrder: `reengagement-active-${suffix}`,
};

databaseDescribe("re-engagement PostgreSQL queue", () => {
  afterAll(async () => {
    const ids = Object.values(chatIds);
    await prisma.telegramNotification.deleteMany({ where: { chatId: { in: ids } } });
    await prisma.order.deleteMany({ where: { chatId: { in: ids } } });
    await prisma.botSession.deleteMany({ where: { chatId: { in: ids } } });
    await prisma.storeRuntimeSetting.deleteMany({ where: { id: "global" } });
    await prisma.$disconnect();
  });

  it("queues buyer and never-buyer once while ignoring opt-out preference", async () => {
    const now = new Date("2026-08-24T12:00:00.000Z");
    const old = new Date("2026-06-01T12:00:00.000Z");
    await setReengagementSettings({
      enabled: true,
      buyerInactiveDays: 30,
      nonBuyerInactiveDays: 7,
      cooldownDays: 14,
      maxMessages: 3,
      batchSize: 10,
      actor: "integration-test",
    });
    await prisma.botSession.createMany({
      data: [
        {
          chatId: chatIds.optOutNonBuyer,
          broadcastEnabled: false,
          lastInboundAt: old,
        },
        { chatId: chatIds.buyer, lastInboundAt: old },
        { chatId: chatIds.recent, lastInboundAt: now },
        {
          chatId: chatIds.unreachable,
          telegramReachable: false,
          lastInboundAt: old,
        },
        { chatId: chatIds.activeOrder, lastInboundAt: old },
      ],
    });
    await prisma.order.createMany({
      data: [
        {
          idempotencyKey: `reengagement-buyer-${suffix}`,
          invoiceNumber: `REBUY-${suffix}`,
          chatId: chatIds.buyer,
          subtotal: 1_000,
          serviceFee: 0,
          grandTotal: 1_000,
          status: "COMPLETED",
          paymentStatus: "PAID",
          expiresAt: old,
          paidAt: old,
          completedAt: old,
        },
        {
          idempotencyKey: `reengagement-active-${suffix}`,
          invoiceNumber: `REACTIVE-${suffix}`,
          chatId: chatIds.activeOrder,
          subtotal: 1_000,
          serviceFee: 0,
          grandTotal: 1_000,
          status: "PENDING_PAYMENT",
          paymentStatus: "PENDING",
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000),
        },
      ],
    });

    await expect(queueReengagementBatch(now)).resolves.toMatchObject({
      enabled: true,
      queued: 2,
      buyers: 1,
      nonBuyers: 1,
    });
    const notifications = await prisma.telegramNotification.findMany({
      where: { chatId: { in: Object.values(chatIds) }, kind: "REENGAGEMENT" },
      orderBy: { chatId: "asc" },
    });
    expect(notifications).toHaveLength(2);
    expect(notifications.map((item) => item.chatId).sort()).toEqual(
      [chatIds.buyer, chatIds.optOutNonBuyer].sort(),
    );
    expect(notifications.find((item) => item.chatId === chatIds.buyer)?.messageText)
      .toBe(DEFAULT_REENGAGEMENT_BUYER_MESSAGE);
    expect(
      notifications.find((item) => item.chatId === chatIds.optOutNonBuyer)?.messageText,
    ).toBe(DEFAULT_REENGAGEMENT_NON_BUYER_MESSAGE);

    await expect(queueReengagementBatch(now)).resolves.toMatchObject({ queued: 0 });
    await expect(
      prisma.telegramNotification.count({
        where: { chatId: { in: Object.values(chatIds) }, kind: "REENGAGEMENT" },
      }),
    ).resolves.toBe(2);
  });
});
