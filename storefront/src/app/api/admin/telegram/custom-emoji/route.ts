import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { setTelegramCustomEmojiId } from "@/server/telegram/custom-emoji";

const customEmojiKeys = ["chatgpt", "claude", "catalog", "product"] as const;

const customEmojiIdSchema = z
  .string()
  .trim()
  .refine((value) => !value || /^[0-9]+$/.test(value), "ID custom emoji harus berupa angka.");

const bodySchema = z.object({
  chatgpt: customEmojiIdSchema,
  claude: customEmojiIdSchema,
  catalog: customEmojiIdSchema,
  product: customEmojiIdSchema,
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = bodySchema.parse(
      Object.fromEntries(customEmojiKeys.map((key) => [key, String(form.get(key) ?? "")])),
    );
    for (const key of customEmojiKeys) {
      await setTelegramCustomEmojiId({
        key,
        id: input[key] || null,
        actor: `admin:${admin.email}`,
      });
    }
    return adminFormSuccess(request, "/admin/telegram?notice=emoji-saved");
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, "/admin/telegram?error=admin-session", "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, "/admin/telegram?error=admin-origin", "admin-origin", 403);
    }
    return adminFormFailure(request, "/admin/telegram?error=emoji-invalid", "emoji-invalid", 422);
  }
}
