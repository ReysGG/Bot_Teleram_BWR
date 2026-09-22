import { prisma } from "@/server/db/prisma";
import {
  resolveTelegramLocale,
  type TelegramLocale,
} from "@/server/telegram/i18n";

export async function telegramLocaleForChat(
  chatId: string,
  telegramLanguageCode?: string | null,
): Promise<TelegramLocale> {
  const session = await prisma.botSession.findUnique({
    where: { chatId },
    select: { locale: true },
  });
  return resolveTelegramLocale({
    preferredLocale: session?.locale,
    telegramLanguageCode,
  });
}

export async function setTelegramLocale(
  chatId: string,
  locale: TelegramLocale,
): Promise<void> {
  await prisma.botSession.upsert({
    where: { chatId },
    create: { chatId, locale },
    update: { locale },
  });
}
