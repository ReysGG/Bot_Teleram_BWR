import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireEnv } from "@/server/env";
import { safeEqual } from "@/server/security/crypto";
import { consumeRateLimit } from "@/server/security/rate-limit";
import {
  handleTelegramUpdate,
  telegramUpdateChatId,
  type TelegramUpdate,
} from "@/server/telegram/flow";
import {
  claimTelegramUpdate,
  completeTelegramUpdate,
  failTelegramUpdate,
} from "@/server/telegram/update-store";

export const runtime = "nodejs";

const updateSchema = z.object({ update_id: z.number().int().nonnegative() }).passthrough();

export async function POST(request: NextRequest) {
  const suppliedSecret = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!safeEqual(suppliedSecret, requireEnv("TELEGRAM_WEBHOOK_SECRET"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const source = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "telegram";
  // Telegram delivers many unrelated chats from the same gateway IP. Keep a
  // generous authenticated source ceiling, then enforce the real abuse limit
  // per chat after parsing the update.
  if (!consumeRateLimit(`telegram-source:${source}`, 5_000, 60_000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > 1024 * 1024) {
    return NextResponse.json({ ok: false }, { status: 413 });
  }

  let update: TelegramUpdate;
  try {
    update = updateSchema.parse(JSON.parse(rawBody)) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const chatId = telegramUpdateChatId(update);
  if (!chatId) return NextResponse.json({ ok: true, ignored: true });
  if (!consumeRateLimit(`telegram-chat:${chatId}`, 120, 60_000)) {
    // Acknowledge noisy chats instead of making Telegram retry and amplify the
    // traffic spike for every rejected update.
    return NextResponse.json({ ok: true, rateLimited: true });
  }
  const claimed = await claimTelegramUpdate({ updateId: update.update_id, chatId });
  if (!claimed) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await handleTelegramUpdate(update);
    await completeTelegramUpdate(update.update_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    await failTelegramUpdate(update.update_id, error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
