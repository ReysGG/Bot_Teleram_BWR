import {
  decryptSecretWithKey,
  encryptSecretWithKey,
  sha256,
} from "@/server/security/crypto";

const SESSION_KEY_ENV = "PAYMENT_SESSION_ENCRYPTION_KEY";

export function normalizeShopeePartnerApiToken(value: string): string {
  const token = value.trim();
  if (token.length < 16 || token.length > 16_384 || /[\u0000-\u001f\u007f]/.test(token)) {
    throw new Error("Token sesi Shopee Partner tidak valid");
  }
  return token;
}

export function encryptShopeePartnerApiToken(value: string) {
  return encryptSecretWithKey(normalizeShopeePartnerApiToken(value), SESSION_KEY_ENV);
}

export function decryptShopeePartnerApiToken(input: {
  encryptedApiToken: string;
  apiTokenEncryptionIv: string;
  apiTokenEncryptionTag: string;
}): string {
  return normalizeShopeePartnerApiToken(decryptSecretWithKey({
    encryptedPayload: input.encryptedApiToken,
    encryptionIv: input.apiTokenEncryptionIv,
    encryptionTag: input.apiTokenEncryptionTag,
  }, SESSION_KEY_ENV));
}

export function shopeePartnerApiTokenFingerprint(value: string): string {
  return sha256(normalizeShopeePartnerApiToken(value));
}
