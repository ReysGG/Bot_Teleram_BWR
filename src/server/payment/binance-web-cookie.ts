import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  sha256,
} from "@/server/security/crypto";

const COOKIE_KEY_ENV = "PAYMENT_SESSION_ENCRYPTION_KEY";
const ALLOWED_DOMAIN = /(^|\.)binance\.com$/i;
const MAX_COOKIES = 120;
const MAX_COOKIE_VALUE_LENGTH = 8192;
const MAX_COOKIE_PATH_LENGTH = 2048;

export type BinanceWebCookie = {
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

export class BinanceWebCookieValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BinanceWebCookieValidationError";
  }
}

function requiredString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new BinanceWebCookieValidationError(`Cookie ${field} tidak valid`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new BinanceWebCookieValidationError(
      `Cookie ${field} mengandung karakter kontrol`,
    );
  }
  return value;
}

function cookieValue(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_COOKIE_VALUE_LENGTH) {
    throw new BinanceWebCookieValidationError("Cookie value tidak valid");
  }
  // Browser exports may contain empty values or JSON-like printable text. Keep
  // delimiters that are valid inside a value, but never allow header injection.
  if (/[\u0000-\u001f\u007f;]/.test(value)) {
    throw new BinanceWebCookieValidationError(
      "Cookie value tidak aman untuk header HTTP",
    );
  }
  return value;
}

export function parseBinanceWebCookieExport(
  input: unknown,
  now = Date.now(),
): BinanceWebCookie[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_COOKIES) {
    throw new BinanceWebCookieValidationError(
      "Export cookie Binance harus berupa array yang tidak kosong",
    );
  }

  const cookies: BinanceWebCookie[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BinanceWebCookieValidationError("Entry cookie Binance tidak valid");
    }
    const item = raw as Record<string, unknown>;
    const rawDomain = requiredString(item.domain, "domain", 255).toLowerCase();
    const domain = rawDomain.startsWith(".") ? rawDomain.slice(1) : rawDomain;
    if (!domain || domain.startsWith(".") || !ALLOWED_DOMAIN.test(domain)) {
      throw new BinanceWebCookieValidationError(
        "Cookie hanya boleh berasal dari binance.com",
      );
    }
    const name = requiredString(item.name, "name", 256);
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) {
      throw new BinanceWebCookieValidationError("Nama cookie Binance tidak valid");
    }
    const value = cookieValue(item.value);
    const path = typeof item.path === "string" && item.path.startsWith("/")
      ? requiredString(item.path, "path", MAX_COOKIE_PATH_LENGTH)
      : "/";
    const expirationDate =
      typeof item.expirationDate === "number" && Number.isFinite(item.expirationDate)
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
    throw new BinanceWebCookieValidationError(
      "Semua cookie Binance sudah kedaluwarsa",
    );
  }

  const uniqueKeys = new Set<string>();
  for (const cookie of cookies) {
    const key = `${cookie.domain}|${cookie.path}|${cookie.name}`;
    if (uniqueKeys.has(key)) {
      throw new BinanceWebCookieValidationError(
        "Export cookie Binance mengandung entry duplikat",
      );
    }
    uniqueKeys.add(key);
  }
  return cookies;
}

function canonicalCookies(cookies: readonly BinanceWebCookie[]): string {
  return [...cookies]
    .sort((left, right) =>
      `${left.domain}|${left.path}|${left.name}`.localeCompare(
        `${right.domain}|${right.path}|${right.name}`,
      ),
    )
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

function cookieDomainMatches(cookie: BinanceWebCookie, hostname: string): boolean {
  const domain = cookie.domain.replace(/^\./, "").toLowerCase();
  if (cookie.hostOnly) return hostname === domain;
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function cookiePathMatches(cookiePath: string, requestPath: string): boolean {
  if (cookiePath === requestPath) return true;
  if (!requestPath.startsWith(cookiePath)) return false;
  return cookiePath.endsWith("/") || requestPath.charAt(cookiePath.length) === "/";
}

export function binanceWebCookieHeader(
  cookies: readonly BinanceWebCookie[],
  target: URL | string,
  now = Date.now(),
): string {
  const url = target instanceof URL ? target : new URL(target);
  const hostname = url.hostname.toLowerCase();
  if (!ALLOWED_DOMAIN.test(hostname)) {
    throw new BinanceWebCookieValidationError("Target cookie Binance tidak valid");
  }
  const requestPath = url.pathname || "/";
  return [...cookies]
    .filter((cookie) =>
      (cookie.expirationDate === undefined || cookie.expirationDate * 1000 > now) &&
      (!cookie.secure || url.protocol === "https:") &&
      cookieDomainMatches(cookie, hostname) &&
      cookiePathMatches(cookie.path, requestPath),
    )
    .sort((left, right) =>
      right.path.length - left.path.length || left.name.localeCompare(right.name),
    )
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

export function binanceWebCookieFingerprint(
  cookies: readonly BinanceWebCookie[],
): string {
  return sha256(canonicalCookies(cookies));
}

export function encryptBinanceWebCookieJar(
  cookies: readonly BinanceWebCookie[],
) {
  return encryptSecretWithKey(JSON.stringify(cookies), COOKIE_KEY_ENV);
}

export function decryptBinanceWebCookieJar(input: {
  encryptedCookieJar: string;
  cookieEncryptionIv: string;
  cookieEncryptionTag: string;
}): BinanceWebCookie[] {
  const raw = decryptSecretWithKey(
    {
      encryptedPayload: input.encryptedCookieJar,
      encryptionIv: input.cookieEncryptionIv,
      encryptionTag: input.cookieEncryptionTag,
    },
    COOKIE_KEY_ENV,
  );
  return parseBinanceWebCookieExport(JSON.parse(raw));
}
