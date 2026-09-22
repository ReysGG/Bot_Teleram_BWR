import { decryptSecretWithKey, encryptSecretWithKey, sha256 } from "@/server/security/crypto";

const COOKIE_KEY_ENV = "PAYMENT_SESSION_ENCRYPTION_KEY";
const ALLOWED_DOMAIN = /(^|\.)shopee\.co\.id$/i;
const MAX_COOKIES = 80;
const MAX_COOKIE_VALUE_LENGTH = 4096;
const MAX_COOKIE_PATH_LENGTH = 2048;

export type ShopeeCookie = {
  domain: string;
  expirationDate?: number;
  hostOnly?: boolean;
  httpOnly?: boolean;
  name: string;
  path: string;
  sameSite?: string | null;
  secure?: boolean;
  session?: boolean;
  storeId?: string | null;
  value: string;
};

export class ShopeeCookieValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShopeeCookieValidationError";
  }
}

function assertString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ShopeeCookieValidationError(`Cookie ${field} tidak valid`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new ShopeeCookieValidationError(`Cookie ${field} mengandung karakter kontrol`);
  }
  return value;
}

export function parseShopeeCookieExport(input: unknown, now = Date.now()): ShopeeCookie[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_COOKIES) {
    throw new ShopeeCookieValidationError("Export cookie Shopee harus berupa array yang tidak kosong");
  }
  const cookies: ShopeeCookie[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") {
      throw new ShopeeCookieValidationError("Entry cookie Shopee tidak valid");
    }
    const item = raw as Record<string, unknown>;
    const rawDomain = assertString(item.domain, "domain", 255).toLowerCase();
    const domain = rawDomain.startsWith(".") ? rawDomain.slice(1) : rawDomain;
    if (!domain || domain.startsWith(".") || !ALLOWED_DOMAIN.test(domain)) {
      throw new ShopeeCookieValidationError("Cookie hanya boleh berasal dari shopee.co.id");
    }
    const name = assertString(item.name, "name", 256);
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new ShopeeCookieValidationError("Nama cookie Shopee tidak valid");
    }
    const value = assertString(item.value, "value", MAX_COOKIE_VALUE_LENGTH);
    if (!/^[\x21-\x2B\x2D-\x3A\x3C-\x7E]+$/.test(value)) {
      throw new ShopeeCookieValidationError("Cookie value tidak aman untuk header HTTP");
    }
    const path = typeof item.path === "string" && item.path.startsWith("/")
      ? assertString(item.path, "path", MAX_COOKIE_PATH_LENGTH)
      : "/";
    const expirationDate = typeof item.expirationDate === "number" && Number.isFinite(item.expirationDate)
      ? item.expirationDate
      : undefined;
    if (expirationDate !== undefined && expirationDate * 1000 <= now) continue;
    cookies.push({
      domain,
      expirationDate,
      hostOnly: item.hostOnly === true,
      httpOnly: item.httpOnly === true,
      name,
      path,
      sameSite: typeof item.sameSite === "string" ? item.sameSite : null,
      secure: item.secure !== false,
      session: item.session === true,
      storeId: typeof item.storeId === "string" ? item.storeId : null,
      value,
    });
  }
  if (cookies.length === 0) {
    throw new ShopeeCookieValidationError("Semua cookie Shopee sudah kedaluwarsa");
  }
  const uniqueKeys = new Set<string>();
  for (const cookie of cookies) {
    const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
    if (uniqueKeys.has(key)) {
      throw new ShopeeCookieValidationError("Export cookie Shopee mengandung entry duplikat");
    }
    uniqueKeys.add(key);
  }
  return cookies;
}

function canonicalCookies(cookies: readonly ShopeeCookie[]): string {
  return [...cookies]
    .sort((a, b) => `${a.domain}|${a.path}|${a.name}`.localeCompare(`${b.domain}|${b.path}|${b.name}`))
    .map((cookie) => JSON.stringify({
      domain: cookie.domain,
      expirationDate: cookie.expirationDate ?? null,
      hostOnly: cookie.hostOnly ?? false,
      name: cookie.name,
      path: cookie.path,
      secure: cookie.secure ?? true,
      value: cookie.value,
    }))
    .join("\n");
}

function cookieDomainMatches(cookie: ShopeeCookie, hostname: string): boolean {
  const domain = cookie.domain.replace(/^\./, "").toLowerCase();
  if (cookie.hostOnly) return hostname === domain;
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function cookiePathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

export function shopeeCookieHeader(
  cookies: readonly ShopeeCookie[],
  target: URL | string,
  now = Date.now(),
): string {
  const url = target instanceof URL ? target : new URL(target);
  const hostname = url.hostname.toLowerCase();
  const requestPath = url.pathname || "/";
  return [...cookies]
    .filter((cookie) => (
      (cookie.expirationDate === undefined || cookie.expirationDate * 1000 > now) &&
      (!cookie.secure || url.protocol === "https:") &&
      cookieDomainMatches(cookie, hostname) &&
      cookiePathMatches(cookie.path, requestPath)
    ))
    .sort((a, b) => b.path.length - a.path.length || a.name.localeCompare(b.name))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function shopeeCookieFingerprint(cookies: readonly ShopeeCookie[]): string {
  return sha256(canonicalCookies(cookies));
}

export function encryptShopeeCookieJar(cookies: readonly ShopeeCookie[]) {
  return encryptSecretWithKey(JSON.stringify(cookies), COOKIE_KEY_ENV);
}

export function decryptShopeeCookieJar(input: {
  encryptedCookieJar: string;
  cookieEncryptionIv: string;
  cookieEncryptionTag: string;
}): ShopeeCookie[] {
  const raw = decryptSecretWithKey({
    encryptedPayload: input.encryptedCookieJar,
    encryptionIv: input.cookieEncryptionIv,
    encryptionTag: input.cookieEncryptionTag,
  }, COOKIE_KEY_ENV);
  return parseShopeeCookieExport(JSON.parse(raw));
}
