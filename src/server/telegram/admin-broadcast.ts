import { prisma } from "@/server/db/prisma";
import {
  fanoutBroadcastNotifications,
  MAX_BROADCAST_RECIPIENTS,
} from "@/server/telegram/broadcast-fanout";
import { adminBroadcastDedupeKey } from "@/server/telegram/delivery-key";
import {
  safeTelegramRichTextEntities,
  shiftTelegramRichTextEntities,
  type TelegramRichTextEntity,
} from "@/lib/telegram-rich-text";

export function adminBroadcastTelegramDocument(input: {
  title: string;
  messageText: string;
  messageEntities: unknown;
}) {
  const prefix = [
    "📣 PENGUMUMAN BWR TELE",
    "━━━━━━━━━━━━",
    "",
    `📌 ${input.title}`,
    "",
    "",
  ].join("\n");
  const titleOffset = prefix.indexOf(input.title);
  return {
    text: `${prefix}${input.messageText}`,
    entities: [
      ...(titleOffset >= 0
        ? [{ type: "bold" as const, offset: titleOffset, length: input.title.length }]
        : []),
      ...shiftTelegramRichTextEntities(
        safeTelegramRichTextEntities(input.messageEntities, input.messageText),
        prefix.length,
      ),
    ],
  };
}

export async function createAdminBroadcast(input: {
  title: string;
  messageText: string;
  messageEntities: TelegramRichTextEntity[];
  createdBy: string;
}) {
  return prisma.$transaction(async (tx) => {
    const broadcast = await tx.adminBroadcast.create({
      data: {
        title: input.title,
        messageText: input.messageText,
        messageEntities: input.messageEntities,
        createdBy: input.createdBy,
        recipientCount: 0,
      },
    });

    const fanout = await fanoutBroadcastNotifications({
      tx,
      maxRecipients: MAX_BROADCAST_RECIPIENTS,
      limitMode: "reject",
      notificationFor: (chatId) => ({
          dedupeKey: adminBroadcastDedupeKey(broadcast.id, chatId),
          chatId,
          broadcastId: broadcast.id,
          kind: "ADMIN_BROADCAST",
          priority: 35,
      }),
    });

    return tx.adminBroadcast.update({
      where: { id: broadcast.id },
      data: { recipientCount: fanout.recipientCount },
    });
  });
}
