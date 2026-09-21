import { NextResponse, type NextRequest } from "next/server";
import { appRoute } from "@/server/env";
import { assertAdminOrigin, requireAdminRequest } from "@/server/security/admin-auth";
import { queueReengagementBatch } from "@/server/telegram/reengagement";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
    const result = await queueReengagementBatch();
    if (!result.enabled) {
      return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?error=disabled"), 303);
    }
    const params = new URLSearchParams({
      notice: "batch-queued",
      queued: String(result.queued),
      buyers: String(result.buyers),
      nonBuyers: String(result.nonBuyers),
    });
    return NextResponse.redirect(appRoute(`/admin/broadcasts/reengagement?${params}`), 303);
  } catch {
    return NextResponse.redirect(appRoute("/admin/broadcasts/reengagement?error=run-failed"), 303);
  }
}
