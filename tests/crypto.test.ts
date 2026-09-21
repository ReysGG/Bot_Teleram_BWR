import { beforeEach, describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  hmacHex,
  verifyTimestampedHmac,
} from "@/server/security/crypto";
import {
  decryptProductAttachment,
  prepareProductAttachment,
} from "@/server/products/attachment";

describe("secret encryption", () => {
  beforeEach(() => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  });

  it("round-trips credential JSON without exposing plaintext in ciphertext", () => {
    const plaintext = JSON.stringify({ accessToken: "secret-access-token-value" });
    const encrypted = encryptSecret(plaintext);

    expect(encrypted.encryptedPayload).not.toContain("secret-access-token-value");
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("rejects a modified authentication tag", () => {
    const encrypted = encryptSecret("sensitive");
    const tag = Buffer.from(encrypted.encryptionTag, "base64");
    tag[0] ^= 1;

    expect(() =>
      decryptSecret({ ...encrypted, encryptionTag: tag.toString("base64") }),
    ).toThrow();
  });

  it("rejects non-standard IV and authentication-tag lengths before decrypting", () => {
    const encrypted = encryptSecret("sensitive");

    expect(() => decryptSecret({
      ...encrypted,
      encryptionIv: Buffer.alloc(8, 1).toString("base64"),
    })).toThrow("Encrypted payload metadata is invalid");
    expect(() => decryptSecret({
      ...encrypted,
      encryptionTag: Buffer.alloc(12, 1).toString("base64"),
    })).toThrow("Encrypted payload metadata is invalid");
  });

  it("encrypts and restores an optional product attachment", async () => {
    const prepared = await prepareProductAttachment(
      new File(["PDF-like guide content"], "guide.pdf", { type: "application/pdf" }),
    );
    expect(prepared?.attachmentEncryptedPayload).not.toContain("guide content");
    expect(
      decryptProductAttachment({
        attachmentEncryptedPayload: prepared!.attachmentEncryptedPayload,
        attachmentEncryptionIv: prepared!.attachmentEncryptionIv,
        attachmentEncryptionTag: prepared!.attachmentEncryptionTag,
      }).toString("utf8"),
    ).toBe("PDF-like guide content");
  });
});

describe("timestamped HMAC", () => {
  it("accepts a valid signature inside the clock window", () => {
    const secret = "a".repeat(32);
    const timestamp = "1785297600000";
    const rawBody = '{"eventId":"evt"}';
    const signature = hmacHex(secret, `${timestamp}.${rawBody}`);

    expect(
      verifyTimestampedHmac({
        secret,
        timestamp,
        signature,
        rawBody,
        now: Number(timestamp) + 1_000,
      }),
    ).toBe(true);
  });

  it("rejects stale and body-modified signatures", () => {
    const secret = "b".repeat(32);
    const timestamp = "1785297600000";
    const signature = hmacHex(secret, `${timestamp}.original`);

    expect(
      verifyTimestampedHmac({
        secret,
        timestamp,
        signature,
        rawBody: "modified",
        now: Number(timestamp),
      }),
    ).toBe(false);
    expect(
      verifyTimestampedHmac({
        secret,
        timestamp,
        signature,
        rawBody: "original",
        now: Number(timestamp) + 6 * 60_000,
      }),
    ).toBe(false);
  });
});
