import { Prisma } from "@/generated/prisma/client";

export const BROADCAST_FANOUT_CHUNK_SIZE = 500;
export const MAX_BROADCAST_RECIPIENTS = 10_000;

type BroadcastFanoutClient = Pick<
  Prisma.TransactionClient,
  "botSession" | "telegramNotification"
>;

export async function fanoutBroadcastNotifications(input: {
  tx: BroadcastFanoutClient;
  notificationFor: (
    chatId: string,
  ) => Prisma.TelegramNotificationCreateManyInput;
  limitMode?: "reject" | "truncate";
  maxRecipients?: number;
  chunkSize?: number;
}) {
  const limitMode = input.limitMode ?? "truncate";
  const maxRecipients = Math.max(
    1,
    Math.trunc(input.maxRecipients ?? MAX_BROADCAST_RECIPIENTS),
  );
  const chunkSize = Math.max(
    1,
    Math.min(
      maxRecipients,
      Math.trunc(input.chunkSize ?? BROADCAST_FANOUT_CHUNK_SIZE),
    ),
  );
  let cursor: string | undefined;
  let recipientCount = 0;
  let queuedCount = 0;

  while (recipientCount < maxRecipients) {
    const remaining = maxRecipients - recipientCount;
    const subscribers = await input.tx.botSession.findMany({
      where: { broadcastEnabled: true },
      select: { chatId: true },
      orderBy: { chatId: "asc" },
      take: Math.min(chunkSize, remaining),
      ...(cursor ? { cursor: { chatId: cursor }, skip: 1 } : {}),
    });
    if (subscribers.length === 0) break;

    const created = await input.tx.telegramNotification.createMany({
      data: subscribers.map(({ chatId }) => input.notificationFor(chatId)),
      skipDuplicates: true,
    });
    recipientCount += subscribers.length;
    queuedCount += created.count;
    cursor = subscribers.at(-1)?.chatId;

    if (subscribers.length < Math.min(chunkSize, remaining)) break;
  }

  if (limitMode === "reject" && recipientCount === maxRecipients) {
    const overflow = await input.tx.botSession.findFirst({
      where: {
        broadcastEnabled: true,
        chatId: { gt: cursor },
      },
      select: { chatId: true },
      orderBy: { chatId: "asc" },
    });
    if (overflow) {
      throw new Error("Jumlah penerima broadcast melebihi batas aman");
    }
  }

  return { recipientCount, queuedCount };
}
