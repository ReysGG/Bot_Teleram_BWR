import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { setReengagementSettings } from "@/server/telegram/reengagement";

const booleanField = z.enum(["true", "false"]).transform((value) => value === "true");
const schema = z.object({
  enabled: booleanField,
  buyerInactiveDays: z.coerce.number().int().min(3).max(365),
  nonBuyerInactiveDays: z.coerce.number().int().min(1).max(365),
  cooldownDays: z.coerce.number().int().min(3).max(365),
  maxMessages: z.coerce.number().int().min(1).max(12),
  batchSize: z.coerce.number().int().min(1).max(250),
  buyerMessage: z.string().trim().min(3).max(2_000),
  nonBuyerMessage: z.string().trim().min(3).max(2_000),
  audienceAcknowledged: booleanField,
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const parsed = schema.safeParse({
      enabled: String(form.get("enabled") ?? "false"),
      buyerInactiveDays: form.get("buyerInactiveDays"),
      nonBuyerInactiveDays: form.get("nonBuyerInactiveDays"),
      cooldownDays: form.get("cooldownDays"),
      maxMessages: form.get("maxMessages"),
      batchSize: form.get("batchSize"),
      buyerMessage: form.get("buyerMessage"),
      nonBuyerMessage: form.get("nonBuyerMessage"),
      audienceAcknowledged: String(form.get("audienceAcknowledged") ?? "false"),
    });
    if (!parsed.success) {
      return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?error=settings-invalid"), 303);
    }
    if (!parsed.data.audienceAcknowledged) {
      return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?error=audience-ack"), 303);
    }
    await setReengagementSettings({
      enabled: parsed.data.enabled,
      buyerInactiveDays: parsed.data.buyerInactiveDays,
      nonBuyerInactiveDays: parsed.data.nonBuyerInactiveDays,
      cooldownDays: parsed.data.cooldownDays,
      maxMessages: parsed.data.maxMessages,
      batchSize: parsed.data.batchSize,
      buyerMessage: parsed.data.buyerMessage,
      nonBuyerMessage: parsed.data.nonBuyerMessage,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?notice=settings-saved"), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?error=settings-save"), 303);
  }
}
