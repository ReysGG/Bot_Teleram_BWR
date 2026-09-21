import { NextResponse, type NextRequest } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  assertAdminOrigin,
  createAdminSessionToken,
  verifyAdminPassword,
} from "@/server/security/admin-auth";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { appRoute } from "@/server/env";

export function GET() {
  return NextResponse.redirect(appRoute("/admin/login"), 307);
}

export async function POST(request: NextRequest) {
  try {
    assertAdminOrigin(request);
  } catch {
    return NextResponse.redirect(appRoute("/admin/login?error=origin"), 303);
  }
  const source = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (!consumeRateLimit(`admin-login:${source}`, 8, 15 * 60_000)) {
    return NextResponse.redirect(appRoute("/admin/login?error=rate"), 303);
  }

  const form = await request.formData();
  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  let valid = false;
  try {
    valid = await verifyAdminPassword(email, password);
  } catch {
    return NextResponse.redirect(appRoute("/admin/login?error=config"), 303);
  }
  if (!valid) {
    return NextResponse.redirect(appRoute("/admin/login?error=invalid"), 303);
  }

  const response = NextResponse.redirect(appRoute("/admin"), 303);
  response.cookies.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(email), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
