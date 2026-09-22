import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { createAdminBroadcast } from "@/server/telegram/admin-broadcast";
import {
  normalizeTelegramRichTextDocument,
  TelegramRichTextInputError,
} from "@/lib/telegram-rich-text";

const broadcastSchema = z.object({
  title: z.string().trim().min(3).max(120),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = broadcastSchema.parse({
      title: form.get("title"),
    });
    const message = normalizeTelegramRichTextDocument({
      text: form.get("message"),
      entities: form.get("messageEntities"),
      minLength: 3,
      maxLength: 3_000,
    });
    const broadcast = await createAdminBroadcast({
      title: input.title,
      messageText: message.text,
      messageEntities: message.entities,
      createdBy: admin.email,
    });
    return NextResponse.redirect(
      appRoute(`/admin/broadcasts?notice=queued&recipients=${broadcast.recipientCount}`),
      303,
    );
  } catch (error) {
    const code = error instanceof TelegramRichTextInputError
      ? "broadcast-format"
      : "broadcast";
    return NextResponse.redirect(
      appRoute(`/admin/broadcasts?error=${code}`),
      303,
    );
  }
}
