import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/server/db/prisma";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { normalizeTelegramRichTextDocument } from "@/lib/telegram-rich-text";
import { serializeAdminMessageSnapshot } from "@/server/telegram/admin-message";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const form = await request.formData();
    const message = normalizeTelegramRichTextDocument({
      text: form.get("message"),
      entities: form.get("messageEntities"),
      maxLength: 2_000,
    });
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    if (order.channel === "WEB" || order.chatId.startsWith("web:")) {
      return NextResponse.redirect(appRoute(`/admin/orders/${id}?error=web-message-unavailable`), 303);
    }
    await prisma.telegramNotification.create({
      data: {
        dedupeKey: `admin-message:${id}:${randomUUID()}`,
        chatId: order.chatId,
        orderId: order.id,
        kind: "ADMIN_MESSAGE",
        messageText: serializeAdminMessageSnapshot(message),
        priority: 30,
      },
    });
    return NextResponse.redirect(
      appRoute(`/admin/orders/${id}?notice=message-queued`),
      303,
    );
  } catch {
    return NextResponse.redirect(
      appRoute(`/admin/orders/${id}?error=admin-message`),
      303,
    );
  }
}
