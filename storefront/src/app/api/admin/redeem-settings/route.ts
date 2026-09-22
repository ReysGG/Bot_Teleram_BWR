import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH,
  setAccountRedeemDescription,
} from "@/server/redeem/settings";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";

const schema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("save"),
    description: z
      .string()
      .max(MAX_ACCOUNT_REDEEM_DESCRIPTION_LENGTH)
      .refine((value) => value.trim().length > 0),
  }),
  z.object({ intent: z.literal("reset") }),
]);

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      intent: form.get("intent"),
      description: String(form.get("description") ?? ""),
    });
    await setAccountRedeemDescription({
      description: input.intent === "reset" ? null : input.description,
      actor: `admin:${admin.email}`,
    });
    return adminFormSuccess(
      request,
      `/admin/redeem?notice=description-${input.intent === "reset" ? "reset" : "updated"}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, "/admin/redeem?error=description", "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, "/admin/redeem?error=description", "admin-origin", 403);
    }
    return adminFormFailure(
      request,
      "/admin/redeem?error=description",
      "description",
      error instanceof z.ZodError ? 422 : 500,
    );
  }
}
