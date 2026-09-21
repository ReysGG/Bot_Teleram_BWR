import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  decryptSecret,
  encryptSecret,
  hmacHex,
  type EncryptedPayload,
} from "@/server/security/crypto";
import { requireEnv } from "@/server/env";
import { safeFilename } from "@/server/utils/format";

const ACCOUNT_SEPARATOR = "----";
const MAX_ACCOUNT_LOGIN_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ACCOUNT_LOGIN_ROWS = 100_000;
const MAX_ACCOUNT_LOGIN_LINE_LENGTH = 24_000;

export type AccountLoginPayload = {
  email: string;
  password: string;
  clientId: string;
  token: string;
};

export type AccountLoginFile = {
  filename: string;
  content: Buffer;
};

type ParsedAccountLoginRow = AccountLoginPayload & {
  emailHash: string;
  tokenHash: string;
  contentFingerprint: string;
  sourceFilename: string;
};

export type AccountLoginImportResult = {
  processed: number;
  imported: number;
  updated: number;
  unchanged: number;
  invalid: number;
  duplicates: number;
  conflicts: number;
};

export class AccountLoginImportError extends Error {
  constructor(
    readonly code: "file-count" | "file-type" | "file-empty" | "file-too-large" | "row-limit" | "token-conflict",
    message: string,
  ) {
    super(message);
    this.name = "AccountLoginImportError";
  }
}

export function normalizeAccountEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 320) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function accountEmailHash(email: string): string {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) throw new Error("Invalid account email");
  return hmacHex(
    requireEnv("DIGITAL_STOCK_ENCRYPTION_KEY"),
    `account-login-email:v1:${normalized}`,
  );
}

function accountTokenHash(token: string): string {
  return hmacHex(
    requireEnv("DIGITAL_STOCK_ENCRYPTION_KEY"),
    `account-login-token:v1:${token}`,
  );
}

function accountContentFingerprint(serialized: string): string {
  return hmacHex(
    requireEnv("DIGITAL_STOCK_ENCRYPTION_KEY"),
    `account-login-content:v1:${serialized}`,
  );
}

export function maskAccountEmail(email: string): string {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return "***";
  const [local, domain] = normalized.split("@");
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(3, Math.min(8, local.length - visible.length)))}@${domain}`;
}

export function serializeAccountLogin(payload: AccountLoginPayload): string {
  return [payload.email, payload.password, payload.clientId, payload.token].join(
    ACCOUNT_SEPARATOR,
  );
}

export function parseAccountLoginLine(line: string): AccountLoginPayload | null {
  const trimmed = line.replace(/^\uFEFF/, "").trim();
  if (!trimmed || trimmed.length > MAX_ACCOUNT_LOGIN_LINE_LENGTH) return null;
  const parts = trimmed.split(ACCOUNT_SEPARATOR);
  if (parts.length < 4) return null;
  const email = normalizeAccountEmail(parts[0]);
  const password = parts[1]?.trim() ?? "";
  const clientId = parts[2]?.trim() ?? "";
  const token = parts.slice(3).join(ACCOUNT_SEPARATOR).trim();
  if (!email) return null;
  if (password.length < 1 || password.length > 512 || /[\r\n\0]/.test(password)) {
    return null;
  }
  if (clientId.length < 8 || clientId.length > 200 || /[\r\n\0]/.test(clientId)) {
    return null;
  }
  if (token.length < 20 || token.length > 20_000 || /[\r\n\0]/.test(token)) {
    return null;
  }
  return { email, password, clientId, token };
}

export function decryptAccountLoginCredential(payload: EncryptedPayload): AccountLoginPayload {
  const parsed = JSON.parse(decryptSecret(payload)) as Partial<AccountLoginPayload>;
  const email = normalizeAccountEmail(parsed.email ?? "");
  if (
    !email ||
    typeof parsed.password !== "string" ||
    typeof parsed.clientId !== "string" ||
    typeof parsed.token !== "string"
  ) {
    throw new Error("Stored account login credential is invalid");
  }
  return {
    email,
    password: parsed.password,
    clientId: parsed.clientId,
    token: parsed.token,
  };
}

export function parseAccountLoginFiles(files: AccountLoginFile[]) {
  if (files.length === 0) {
    throw new AccountLoginImportError("file-count", "Upload requires at least one file");
  }

  const rows: ParsedAccountLoginRow[] = [];
  let processed = 0;
  let invalid = 0;
  for (const file of files) {
    if (!/\.txt$/i.test(file.filename)) {
      throw new AccountLoginImportError("file-type", "Account login upload only accepts TXT files");
    }
    if (file.content.byteLength === 0) {
      throw new AccountLoginImportError("file-empty", "Account login file is empty");
    }
    if (file.content.byteLength > MAX_ACCOUNT_LOGIN_FILE_BYTES) {
      throw new AccountLoginImportError("file-too-large", "Account login file exceeds 5 MB");
    }
    const sourceFilename = safeFilename(file.filename);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(file.content);
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim()) continue;
      processed += 1;
      if (processed > MAX_ACCOUNT_LOGIN_ROWS) {
        throw new AccountLoginImportError("row-limit", "Account login upload exceeds the safe processing limit");
      }
      const payload = parseAccountLoginLine(line);
      if (!payload) {
        invalid += 1;
        continue;
      }
      const serialized = serializeAccountLogin(payload);
      rows.push({
        ...payload,
        emailHash: accountEmailHash(payload.email),
        tokenHash: accountTokenHash(payload.token),
        contentFingerprint: accountContentFingerprint(serialized),
        sourceFilename,
      });
    }
  }

  const unique = new Map<string, ParsedAccountLoginRow>();
  const conflicted = new Set<string>();
  let duplicates = 0;
  for (const row of rows) {
    const current = unique.get(row.emailHash);
    if (!current) {
      unique.set(row.emailHash, row);
      continue;
    }
    if (current.contentFingerprint === row.contentFingerprint) {
      duplicates += 1;
      continue;
    }
    conflicted.add(row.emailHash);
  }
  for (const emailHash of conflicted) unique.delete(emailHash);

  const tokenOwners = new Map<string, string>();
  for (const row of unique.values()) {
    const owner = tokenOwners.get(row.tokenHash);
    if (owner && owner !== row.emailHash) {
      conflicted.add(owner);
      conflicted.add(row.emailHash);
      continue;
    }
    tokenOwners.set(row.tokenHash, row.emailHash);
  }
  for (const emailHash of conflicted) unique.delete(emailHash);

  return {
    rows: [...unique.values()],
    processed,
    invalid,
    duplicates,
    conflicts: conflicted.size,
  };
}

export async function importAccountLoginFiles(input: {
  files: AccountLoginFile[];
  importedBy: string;
}): Promise<AccountLoginImportResult> {
  const parsed = parseAccountLoginFiles(input.files);
  if (parsed.rows.length === 0) {
    return {
      processed: parsed.processed,
      imported: 0,
      updated: 0,
      unchanged: 0,
      invalid: parsed.invalid,
      duplicates: parsed.duplicates,
      conflicts: parsed.conflicts,
    };
  }

  const existing = await prisma.accountLoginCredential.findMany({
    where: {
      OR: [
        { emailHash: { in: parsed.rows.map((row) => row.emailHash) } },
        { tokenHash: { in: parsed.rows.map((row) => row.tokenHash) } },
      ],
    },
    select: { id: true, emailHash: true, tokenHash: true, contentFingerprint: true },
  });
  const existingByHash = new Map(existing.map((row) => [row.emailHash, row]));
  const existingByToken = new Map(existing.map((row) => [row.tokenHash, row]));
  const actions: Prisma.PrismaPromise<unknown>[] = [];
  let imported = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of parsed.rows) {
    const stored = existingByHash.get(row.emailHash);
    const tokenOwner = existingByToken.get(row.tokenHash);
    if (tokenOwner && tokenOwner.emailHash !== row.emailHash) {
      throw new AccountLoginImportError(
        "token-conflict",
        "One login token is already assigned to another account",
      );
    }
    if (stored?.contentFingerprint === row.contentFingerprint) {
      unchanged += 1;
      continue;
    }
    const encrypted = encryptSecret(
      JSON.stringify({
        email: row.email,
        password: row.password,
        clientId: row.clientId,
        token: row.token,
      } satisfies AccountLoginPayload),
    );
    const data = {
      emailMasked: maskAccountEmail(row.email),
      tokenHash: row.tokenHash,
      contentFingerprint: row.contentFingerprint,
      sourceFilename: row.sourceFilename,
      importedBy: input.importedBy,
      ...encrypted,
    };
    if (stored) {
      updated += 1;
      actions.push(
        prisma.accountLoginCredential.update({ where: { id: stored.id }, data }),
      );
    } else {
      imported += 1;
      actions.push(
        prisma.accountLoginCredential.create({
          data: { emailHash: row.emailHash, ...data },
        }),
      );
    }
  }

  if (actions.length > 0) await prisma.$transaction(actions);

  return {
    processed: parsed.processed,
    imported,
    updated,
    unchanged,
    invalid: parsed.invalid,
    duplicates: parsed.duplicates,
    conflicts: parsed.conflicts,
  };
}
