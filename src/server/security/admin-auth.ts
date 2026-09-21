import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { adminChatIds, appUrl, requireEnv } from "@/server/env";
import { hmacHex, safeEqual } from "@/server/security/crypto";

export const ADMIN_SESSION_COOKIE = "telegram_store_admin";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$.{53}$/;

type AdminSession = {
  email: string;
  expiresAt: number;
  passwordVersion: string;
};

function sign(encodedPayload: string): string {
  return hmacHex(requireEnv("AUTH_SECRET", 32), encodedPayload);
}

function currentPasswordVersion(): string {
  return hmacHex(
    requireEnv("AUTH_SECRET", 32),
    requireEnv("ADMIN_PASSWORD_HASH"),
  );
}

export function createAdminSessionToken(email: string): string {
  const payload: AdminSession = {
    email,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    passwordVersion: currentPasswordVersion(),
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${encoded}.${sign(encoded)}`;
}

export function verifyAdminSessionToken(token?: string): AdminSession | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as AdminSession;
    if (
      payload.email !== requireEnv("ADMIN_EMAIL") ||
      typeof payload.passwordVersion !== "string" ||
      !safeEqual(payload.passwordVersion, currentPasswordVersion()) ||
      payload.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifyAdminPassword(
  email: string,
  password: string,
): Promise<boolean> {
  if (email.trim().toLowerCase() !== requireEnv("ADMIN_EMAIL").toLowerCase()) {
    return false;
  }
  const passwordHash = requireEnv("ADMIN_PASSWORD_HASH");
  if (!BCRYPT_HASH_PATTERN.test(passwordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH must contain a bcrypt hash");
  }
  return bcrypt.compare(password, passwordHash);
}

export async function requireAdminPage(): Promise<AdminSession> {
  const cookieStore = await cookies();
  const session = verifyAdminSessionToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (!session) redirect("/admin/login");
  return session;
}

export function requireAdminRequest(request: NextRequest): AdminSession {
  const session = verifyAdminSessionToken(
    request.cookies.get(ADMIN_SESSION_COOKIE)?.value,
  );
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

export function assertAdminOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin || origin !== appUrl().origin) {
    throw new Error("INVALID_ORIGIN");
  }
}

export function isTelegramAdmin(chatId: string): boolean {
  return adminChatIds().has(chatId);
}
