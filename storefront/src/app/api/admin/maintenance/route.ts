import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { appRoute } from "@/server/env";
import {
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { setMaintenanceState } from "@/server/store/maintenance";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    const admin = requireAdminRequest(request);
    const form = await request.formData();
    const enabled = String(form.get("enabled") ?? "") === "true";
    const message = z
      .string()
      .trim()
      .max(500)
      .optional()
      .parse(String(form.get("message") ?? "") || undefined);
    await setMaintenanceState({
      enabled,
      message,
      actor: `admin:${admin.email}`,
    });
    return NextResponse.redirect(
      appRoute(`/admin?notice=maintenance-${enabled ? "enabled" : "disabled"}`),
      303,
    );
  } catch {
    return NextResponse.redirect(appRoute("/admin?error=maintenance"), 303);
  }
}
