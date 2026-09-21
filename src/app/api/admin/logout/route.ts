import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  assertAdminOrigin,
  requireAdminRequest,
} from "@/server/security/admin-auth";
import { appRoute } from "@/server/env";

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
    requireAdminRequest(request);
  } catch {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const response = NextResponse.redirect(appRoute("/admin/login"), 303);
  response.cookies.set(ADMIN_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
