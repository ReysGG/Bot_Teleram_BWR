import { beforeEach, describe, expect, it } from "vitest";
import { encryptSecret } from "@/server/security/crypto";
import {
  accountEmailHash,
  decryptAccountLoginCredential,
  parseAccountLoginFiles,
  parseAccountLoginLine,
  serializeAccountLogin,
} from "@/server/redeem/account-login";
import {
  newPendingRedeemBatch,
  parsePendingRedeemBatch,
  parseRedeemJson,
  redeemOutputFilename,
} from "@/server/redeem/service";

function k12(email: string, token: string) {
  return {
    email,
    accessToken: token,
    refreshToken: `refresh-${token}`,
    provider: "codex",
  };
}

describe("K12 account login vault parser", () => {
  beforeEach(() => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 19).toString("base64");
  });

  it("accepts the four-column Outlook format and token special characters", () => {
    const line = "buyer@example.com----P@ss-123----9e5f94bc-e8a4-4e73-b8be-63364c29d753----M.C5!*token$value-long-enough";
    const parsed = parseAccountLoginLine(line);

    expect(parsed).toEqual({
      email: "buyer@example.com",
      password: "P@ss-123",
      clientId: "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
      token: "M.C5!*token$value-long-enough",
    });
    expect(serializeAccountLogin(parsed!)).toBe(line);
  });

  it("supports BOM/CRLF, shared client ids, and rejects conflicting email rows", () => {
    const sharedId = "9e5f94bc-e8a4-4e73-b8be-63364c29d753";
    const parsed = parseAccountLoginFiles([{
      filename: "synthetic.txt",
      content: Buffer.from([
        `\uFEFFfirst@example.com----pass-one----${sharedId}----${"a".repeat(30)}`,
        `second@example.com----pass-two----${sharedId}----${"b".repeat(30)}`,
        `first@example.com----different----${sharedId}----${"c".repeat(30)}`,
        "invalid-row",
      ].join("\r\n")),
    }]);

    expect(parsed.processed).toBe(4);
    expect(parsed.rows.map((row) => row.email)).toEqual(["second@example.com"]);
    expect(parsed.conflicts).toBe(1);
    expect(parsed.invalid).toBe(1);
  });

  it("rejects non-TXT account login files on the server", () => {
    expect(() => parseAccountLoginFiles([{
      filename: "synthetic.json",
      content: Buffer.from("not-a-txt-upload"),
    }])).toThrowError(expect.objectContaining({ code: "file-type" }));
  });

  it("stores blind hashes and decrypts only a valid encrypted payload", () => {
    const payload = {
      email: "secure@example.com",
      password: "synthetic-password",
      clientId: "synthetic-client-id",
      token: "synthetic-token-value-long-enough",
    };
    const hash = accountEmailHash(payload.email);
    const encrypted = encryptSecret(JSON.stringify(payload));

    expect(hash).toHaveLength(64);
    expect(hash).not.toContain("secure@example.com");
    expect(encrypted.encryptedPayload).not.toContain(payload.password);
    expect(decryptAccountLoginCredential(encrypted)).toEqual(payload);
  });
});

describe("K12 redeem JSON batches", () => {
  it("accepts a single object and a root 9router array", () => {
    const single = parseRedeemJson(
      Buffer.from(JSON.stringify(k12("one@example.com", "a".repeat(30)))),
    );
    const bulk = parseRedeemJson(
      Buffer.from(JSON.stringify([
        k12("one@example.com", "a".repeat(30)),
        k12("two@example.com", "b".repeat(30)),
      ])),
    );

    expect(single.credentials).toHaveLength(1);
    expect(bulk.credentials).toHaveLength(2);
    expect(bulk.invalid).toBe(0);
  });

  it("deduplicates repeated accounts and rejects generic JSON", () => {
    const repeated = k12("same@example.com", "a".repeat(30));
    const parsed = parseRedeemJson(Buffer.from(JSON.stringify([repeated, repeated, { foo: "bar" }])));

    expect(parsed.credentials).toHaveLength(1);
    expect(parsed.duplicates).toBe(1);
    expect(parsed.invalid).toBe(1);
  });

  it("keeps only non-sensitive batch metadata in the Telegram session", () => {
    const pending = newPendingRedeemBatch(42);
    expect(parsePendingRedeemBatch(pending as never)).toEqual(pending);
    expect(JSON.stringify(pending)).not.toContain("accessToken");
    expect(JSON.stringify(pending)).not.toContain("password");
  });

  it("creates one stable TXT filename for single or bulk output", () => {
    expect(redeemOutputFilename(5, new Date("2026-08-10T10:20:30.000Z"))).toBe(
      "BWR-20260810T102030Z-5-account-login.txt",
    );
  });
});
