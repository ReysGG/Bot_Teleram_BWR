import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createAdminBroadcast } from "@/server/telegram/admin-broadcast";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const chatIds = [
  `broadcast-enabled-${randomUUID()}`,
  `broadcast-disabled-${randomUUID()}`,
];
const broadcastIds: string[] = [];

databaseDescribe("admin broadcast PostgreSQL outbox", () => {
  afterAll(async () => {
    await prisma.telegramNotification.deleteMany({
      where: { broadcastId: { in: broadcastIds } },
    });
    await prisma.adminBroadcast.deleteMany({ where: { id: { in: broadcastIds } } });
    await prisma.botSession.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.$disconnect();
  });

  it("queues exactly one notification for an opted-in user and skips opt-out", async () => {
    await prisma.botSession.createMany({
      data: [
        { chatId: chatIds[0], broadcastEnabled: true },
        { chatId: chatIds[1], broadcastEnabled: false },
      ],
    });

    const broadcast = await createAdminBroadcast({
      title: "Integration announcement",
      messageText: "Temporary broadcast message",
      messageEntities: [],
      createdBy: "integration-test",
    });
    broadcastIds.push(broadcast.id);

    expect(
      await prisma.telegramNotification.count({
        where: { broadcastId: broadcast.id, chatId: chatIds[0] },
      }),
    ).toBe(1);
    expect(
      await prisma.telegramNotification.count({
        where: { broadcastId: broadcast.id, chatId: chatIds[1] },
      }),
    ).toBe(0);
    const notification = await prisma.telegramNotification.findFirstOrThrow({
      where: { broadcastId: broadcast.id, chatId: chatIds[0] },
    });
    expect(notification).toMatchObject({
      kind: "ADMIN_BROADCAST",
      status: "PENDING",
      priority: 35,
    });
  });
});
