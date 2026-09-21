import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminFormFailure, adminFormSuccess } from "@/server/admin/form-response";
import { getBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { createBinanceWebSession } from "@/server/payment/binance-web-session";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  cookieJson: z.string().min(2).max(768_000),
});

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const input = schema.parse({
      name: form.get("name"),
      cookieJson: form.get("cookieJson"),
    });
    const setting = await getBinanceInternalSetting();
    if (!setting.recipientId) {
      return adminFormFailure(
        request,
        "/admin/payment-settings/binance-web?error=recipient-required",
        "recipient-required",
        422,
      );
    }
    await createBinanceWebSession({
      name: input.name,
      cookieExport: JSON.parse(input.cookieJson),
      recipientBinanceId: setting.recipientId,
      actor: `admin:${admin.email}`,
    });
    return adminFormSuccess(
      request,
      "/admin/payment-settings/binance-web?notice=session-created",
      201,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return adminFormFailure(
        request,
        "/admin/payment-settings/binance-web?error=admin-session",
        "admin-session",
        401,
      );
    }
    if (error instanceof Error && error.message === "INVALID_ORIGIN") {
      return adminFormFailure(
        request,
        "/admin/payment-settings/binance-web?error=admin-origin",
        "admin-origin",
        403,
      );
    }
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return adminFormFailure(
        request,
        "/admin/payment-settings/binance-web?error=session-duplicate",
        "session-duplicate",
        409,
      );
    }
    return adminFormFailure(
      request,
      "/admin/payment-settings/binance-web?error=session-invalid",
      "session-invalid",
      422,
    );
  }
}
