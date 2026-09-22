import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { createShopeePartnerSession, listShopeePartnerSessions } from "@/server/payment/shopee-partner-session";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  cookieJson: z.string().min(2).max(512_000),
  apiToken: z.string().trim().min(16).max(16_384),
});

export async function GET(request: NextRequest) {
  try {
    requireAdminRequest(request);
    return NextResponse.json({ ok: true, sessions: await listShopeePartnerSessions() });
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = bodySchema.parse({
      name: form.get("name"),
      cookieJson: form.get("cookieJson"),
      apiToken: form.get("apiToken"),
    });
    await createShopeePartnerSession({
      name: input.name,
      apiToken: input.apiToken,
      cookieExport: JSON.parse(input.cookieJson),
      actor: `admin:${admin.email}`,
    });
    return adminFormSuccess(
      request,
      "/admin/payment-settings/shopee?notice=session-created",
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(request, "/admin/payment-settings/shopee?error=admin-session", "admin-session", 401);
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(request, "/admin/payment-settings/shopee?error=admin-origin", "admin-origin", 403);
    }
    return adminFormFailure(request, "/admin/payment-settings/shopee?error=session-invalid", "session-invalid", 422);
  }
}
