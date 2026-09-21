import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { requireEnv } from "@/server/env";

const ENCRYPTION_AAD = Buffer.from("telegram-digital-stock:v1", "utf8");

export type EncryptedPayload = {
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
};

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmacHex(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyTimestampedHmac(input: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  now?: number;
  maximumSkewMs?: number;
}): boolean {
  const {
    secret,
    timestamp,
    signature,
    rawBody,
    now = Date.now(),
    maximumSkewMs = 5 * 60 * 1000,
  } = input;

  if (!timestamp || !signature || !/^\d{13}$/.test(timestamp)) return false;
  if (Math.abs(now - Number(timestamp)) > maximumSkewMs) return false;

  return safeEqual(signature, hmacHex(secret, `${timestamp}.${rawBody}`));
}

function encryptionKey(name = "DIGITAL_STOCK_ENCRYPTION_KEY"): Buffer {
  const configured = requireEnv(name);
  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (key.length !== 32) {
    throw new Error(`${name} must decode to 32 bytes`);
  }
  return key;
}

export function encryptSecret(plaintext: string): EncryptedPayload {
  return encryptSecretWithKey(plaintext, "DIGITAL_STOCK_ENCRYPTION_KEY");
}

export function encryptSecretWithKey(
  plaintext: string,
  keyEnvName: string,
): EncryptedPayload {
  const iv = randomBytes(12);
  const key = encryptionKey(keyEnvName);
  let cipher;
  try {
    cipher = createCipheriv("aes-256-gcm", key, iv);
  } finally {
    key.fill(0);
  }
  cipher.setAAD(ENCRYPTION_AAD);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    encryptedPayload: encrypted.toString("base64"),
    encryptionIv: iv.toString("base64"),
    encryptionTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecretBuffer(payload: EncryptedPayload): Buffer {
  return decryptSecretBufferWithKey(payload, "DIGITAL_STOCK_ENCRYPTION_KEY");
}

export function decryptSecretBufferWithKey(
  payload: EncryptedPayload,
  keyEnvName: string,
): Buffer {
  const key = encryptionKey(keyEnvName);
  const iv = Buffer.from(payload.encryptionIv, "base64");
  const tag = Buffer.from(payload.encryptionTag, "base64");
  const encrypted = Buffer.from(payload.encryptedPayload, "base64");
  try {
    if (iv.length !== 12 || tag.length !== 16) {
      throw new Error("Encrypted payload metadata is invalid");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: 16,
    });
    decipher.setAAD(ENCRYPTION_AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  } finally {
    key.fill(0);
    iv.fill(0);
    tag.fill(0);
    encrypted.fill(0);
  }
}

export function decryptSecret(payload: EncryptedPayload): string {
  return decryptSecretWithKey(payload, "DIGITAL_STOCK_ENCRYPTION_KEY");
}

export function decryptSecretWithKey(
  payload: EncryptedPayload,
  keyEnvName: string,
): string {
  const plaintext = decryptSecretBufferWithKey(payload, keyEnvName);
  try {
    return plaintext.toString("utf8");
  } finally {
    plaintext.fill(0);
  }
}
