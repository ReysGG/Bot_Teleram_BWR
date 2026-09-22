import { z } from "zod";
import { sha256 } from "@/server/security/crypto";

const credentialSchema = z
  .object({
    accessToken: z.string().min(20),
    refreshToken: z.string().optional(),
    email: z.string().optional(),
    provider: z.string().optional(),
    providerSpecificData: z
      .object({
        chatgptAccountId: z.string().optional(),
        workspaceId: z.string().optional(),
        accountId: z.string().optional(),
        chatgptPlanType: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type CredentialJson = z.infer<typeof credentialSchema>;

type ParsedStockJson =
  | {
      kind: "K12";
      credential: CredentialJson;
      fingerprint: string;
      legacyFingerprint: string;
    }
  | {
      kind: "GENERIC";
      credential: null;
      fingerprint: string;
      legacyFingerprint: null;
    };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function tokenSubject(accessToken: string): string | null {
  const payload = accessToken.split(".")[1];
  if (!payload) return null;
  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    if (!isRecord(claims)) return null;
    const auth = claims["https://api.openai.com/auth"];
    if (isRecord(auth) && typeof auth.user_id === "string" && auth.user_id) {
      return auth.user_id;
    }
    return typeof claims.sub === "string" && claims.sub ? claims.sub : null;
  } catch {
    return null;
  }
}

function credentialFingerprint(credential: CredentialJson): string {
  const provider = (credential.provider ?? "unknown").trim().toLowerCase();
  const subject = tokenSubject(credential.accessToken);
  const email = credential.email?.trim().toLowerCase();
  const identity = subject
    ? `subject:${subject}`
    : email
      ? `email:${email}`
      : credential.providerSpecificData?.accountId
        ? `account:${credential.providerSpecificData.accountId}`
        : credential.providerSpecificData?.chatgptAccountId
          ? `chatgpt-account:${credential.providerSpecificData.chatgptAccountId}`
          : credential.providerSpecificData?.workspaceId
            ? `workspace:${credential.providerSpecificData.workspaceId}`
            : `token:${credential.accessToken}`;
  return sha256(`credential:v2:${provider}:${identity}`);
}

function legacyCredentialFingerprint(credential: CredentialJson): string {
  const stableIdentity =
    credential.providerSpecificData?.workspaceId ??
    credential.providerSpecificData?.accountId ??
    credential.providerSpecificData?.chatgptAccountId ??
    credential.email ??
    credential.accessToken;
  return sha256(`${credential.provider ?? "unknown"}:${stableIdentity}`);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function parseCredentialJson(rawJson: string): {
  credential: CredentialJson;
  fingerprint: string;
  legacyFingerprint: string;
} {
  const credential = credentialSchema.parse(JSON.parse(rawJson));
  return {
    credential,
    fingerprint: credentialFingerprint(credential),
    legacyFingerprint: legacyCredentialFingerprint(credential),
  };
}

export function parseStockJson(rawJson: string): ParsedStockJson {
  const parsed: unknown = JSON.parse(rawJson);
  const credentialResult = credentialSchema.safeParse(parsed);
  if (credentialResult.success) {
    const credential = credentialResult.data;
    return {
      kind: "K12",
      credential,
      fingerprint: credentialFingerprint(credential),
      legacyFingerprint: legacyCredentialFingerprint(credential),
    };
  }

  return {
    kind: "GENERIC",
    credential: null,
    fingerprint: sha256(`generic-json:${canonicalJson(parsed)}`),
    legacyFingerprint: null,
  };
}

export function detectStockContent(rawContent: string): ParsedStockJson {
  try {
    return parseStockJson(rawContent);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return {
      kind: "GENERIC",
      credential: null,
      fingerprint: sha256(`generic-file:${rawContent}`),
      legacyFingerprint: null,
    };
  }
}
