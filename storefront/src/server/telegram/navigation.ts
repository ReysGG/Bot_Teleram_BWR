import { prisma } from "@/server/db/prisma";
import {
  answerCallbackQuery,
  deleteMessage,
  editMessageCaption,
  editMessageMedia,
  editMessageText,
  sendMessage,
  sendPhoto,
  sendPhotoBuffer,
  TelegramApiError,
  type InlineKeyboard,
  type TelegramMessageEntity,
} from "@/server/telegram/api";
import type { TelegramMessage } from "./types";

function navigationPhotoPresentation(input: {
  text: string;
  entities?: readonly TelegramMessageEntity[];
}) {
  let end = Math.min(input.text.length, 1_024);
  if (end > 0 && end < input.text.length) {
    const previous = input.text.charCodeAt(end - 1);
    const current = input.text.charCodeAt(end);
    if (
      previous >= 0xd800 &&
      previous <= 0xdbff &&
      current >= 0xdc00 &&
      current <= 0xdfff
    ) {
      end -= 1;
    }
  }
  const text = input.text.slice(0, end).trimEnd();
  const entities = (input.entities ?? []).flatMap((entity) => {
    if (entity.offset >= text.length) return [];
    const entityEnd = Math.min(entity.offset + entity.length, text.length);
    if (entityEnd <= entity.offset) return [];
    return [{ ...entity, length: entityEnd - entity.offset }];
  });
  return { text, entities };
}

async function isProtectedDeliveryMessage(chatId: string, messageId: number, editableInvoiceOrderId?: string): Promise<boolean> {
  const receipt = await prisma.sentDelivery.findFirst({
    where: { chatId, telegramMessageId: String(messageId) },
    select: { id: true },
  });
  if (receipt) return true;
  const invoice = await prisma.payment.findFirst({
    where: { telegramInvoiceMessageId: messageId, order: { chatId } },
    select: { orderId: true },
  });
  return Boolean(invoice && invoice.orderId !== editableInvoiceOrderId);
}

async function deleteNavigationMessageIfSafe(
  chatId: string,
  messageId: number,
  protectedMessageId?: number,
) {
  if (messageId === protectedMessageId) return;
  if (await isProtectedDeliveryMessage(chatId, messageId)) return;
  await deleteMessage(chatId, messageId).catch(() => undefined);
}

export async function beginNewNavigationBubble(
  chatId: string,
  protectedMessageId?: number,
) {
  const session = await prisma.botSession.findUnique({
    where: { chatId },
    select: { navigationMessageId: true },
  });
  await prisma.botSession.updateMany({
    where: { chatId },
    data: { navigationMessageId: null },
  });
  if (session?.navigationMessageId) {
    await deleteNavigationMessageIfSafe(chatId, session.navigationMessageId, protectedMessageId);
  }
}

export function isMessageNotModifiedError(error: unknown): boolean {
  return (
    error instanceof TelegramApiError &&
    error.responseReceived &&
    error.message.toLowerCase().includes("message is not modified")
  );
}

export function navigationMessageTarget(
  explicitMessageId?: number,
  rememberedMessageId?: number | null,
) {
  return explicitMessageId ?? rememberedMessageId ?? undefined;
}

export function callbackNavigationMessageId(
  message?: Pick<TelegramMessage, "message_id" | "document">,
) {
  return message?.document ? undefined : message?.message_id;
}

export async function renderNavigationMessage(input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  entities?: readonly TelegramMessageEntity[];
  messageId?: number;
  invoiceOrderId?: string;
  photoUrl?: string | null;
  photoBuffer?: {
    filename: string;
    png: Buffer;
    reuseExistingPhoto?: boolean;
  } | null;
}) {
  const hasPhoto = Boolean(input.photoUrl || input.photoBuffer);
  const presentation = hasPhoto
    ? navigationPhotoPresentation(input)
    : { text: input.text, entities: [...(input.entities ?? [])] };
  const session = await prisma.botSession.findUnique({
    where: { chatId: input.chatId },
    select: { navigationMessageId: true },
  });
  const rememberedMessageId = session?.navigationMessageId ?? undefined;
  const proposedTarget = navigationMessageTarget(input.messageId, rememberedMessageId);
  const targetMessageId = proposedTarget && await isProtectedDeliveryMessage(input.chatId, proposedTarget, input.invoiceOrderId)
    ? undefined : proposedTarget;
  const remember = async (messageId: number) => {
    await prisma.botSession.upsert({
      where: { chatId: input.chatId },
      create: { chatId: input.chatId, navigationMessageId: messageId },
      update: { navigationMessageId: messageId },
    });
    return { message_id: messageId };
  };
  const deletePreviousNavigation = async () => {
    if (rememberedMessageId && input.messageId && rememberedMessageId !== input.messageId) {
      await deleteNavigationMessageIfSafe(input.chatId, rememberedMessageId);
    }
  };
  const sendNewBubble = async () => {
    if (input.photoBuffer) {
      try {
        return await sendPhotoBuffer({
          chatId: input.chatId,
          filename: input.photoBuffer.filename,
          png: input.photoBuffer.png,
          caption: presentation.text,
          replyMarkup: input.replyMarkup,
          captionEntities: presentation.entities,
        });
      } catch (error) {
        if (
          !(error instanceof TelegramApiError) ||
          !error.responseReceived ||
          (error.statusCode !== 400 && error.statusCode !== 413)
        ) {
          throw error;
        }
        // The address and exact amount remain usable when Telegram rejects PNG media.
      }
    }
    if (input.photoUrl) {
      try {
        return await sendPhoto(
          input.chatId,
          input.photoUrl,
          presentation.text,
          input.replyMarkup,
          presentation.entities,
        );
      } catch (error) {
        if (
          !(error instanceof TelegramApiError) ||
          !error.responseReceived ||
          (error.statusCode !== 400 && error.statusCode !== 413)
        ) {
          throw error;
        }
        // Invalid legacy media must not hide the product or its buy button.
      }
    }
    return sendMessage(
      input.chatId,
      presentation.text,
      input.replyMarkup,
      presentation.entities,
    );
  };

  if (!targetMessageId) {
    const sent = await sendNewBubble();
    return remember(sent.message_id);
  }
  if (input.photoBuffer && !input.photoBuffer.reuseExistingPhoto) {
    const sent = await sendNewBubble();
    await deleteNavigationMessageIfSafe(input.chatId, targetMessageId);
    await deletePreviousNavigation();
    return remember(sent.message_id);
  }
  try {
    const edited = input.photoBuffer
      ? await editMessageCaption({
          chatId: input.chatId,
          messageId: targetMessageId,
          caption: presentation.text,
          replyMarkup: input.replyMarkup,
          captionEntities: presentation.entities,
        })
      : input.photoUrl
        ? await editMessageMedia({
          chatId: input.chatId,
          messageId: targetMessageId,
          photo: input.photoUrl,
          caption: presentation.text,
          replyMarkup: input.replyMarkup,
          captionEntities: presentation.entities,
        })
        : await editMessageText({
          chatId: input.chatId,
          messageId: targetMessageId,
          text: presentation.text,
          replyMarkup: input.replyMarkup,
          entities: presentation.entities,
        });
    await deletePreviousNavigation();
    return remember(edited.message_id);
  } catch (error) {
    if (isMessageNotModifiedError(error)) {
      await deletePreviousNavigation();
      return remember(targetMessageId);
    }
    if (error instanceof TelegramApiError && error.responseReceived) {
      await deleteNavigationMessageIfSafe(input.chatId, targetMessageId);
      const sent = await sendNewBubble();
      await deletePreviousNavigation();
      return remember(sent.message_id);
    }
    throw error;
  }
}

export { answerCallbackQuery };
