import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    shopeePartnerSession: {
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

import {
  createShopeePartnerSession,
  revokeShopeePartnerSession,
} from "@/server/payment/shopee-partner-session";

const cookie = {
  domain: ".shopee.co.id",
  expirationDate: 2_000_000_000,
  name: "SPC_T_ID",
  path: "/",
  secure: true,
  value: "redacted-session-value",
};

describe("Shopee Partner session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "session-1",
      name: data.name,
      cookieFingerprint: data.cookieFingerprint,
      apiTokenFingerprint: data.apiTokenFingerprint,
      merchantAccountFingerprint: null,
      status: data.status,
      lastValidatedAt: null,
      lastSuccessfulPollAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      revokedAt: null,
      revokedBy: null,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.update.mockResolvedValue({ id: "session-1", status: "REVOKED" });
  });

  it("stores new credentials encrypted and pending validation", async () => {
    const token = "safe-test-token-value";
    await createShopeePartnerSession({
      name: "Primary merchant",
      cookieExport: [cookie],
      apiToken: token,
      actor: "admin:owner@example.test",
    });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_VALIDATION");
    expect(data.encryptedCookieJar).not.toContain(cookie.value);
    expect(data.encryptedApiToken).not.toContain(token);
    expect(data.cookieFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(data.apiTokenFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(data).not.toHaveProperty("merchantAccountFingerprint");
  });

  it("scrubs every encrypted credential when revoked", async () => {
    await revokeShopeePartnerSession("session-1", "admin:owner@example.test");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-1" },
      data: expect.objectContaining({
        status: "REVOKED",
        encryptedCookieJar: null,
        cookieEncryptionIv: null,
        cookieEncryptionTag: null,
        cookieFingerprint: null,
        encryptedApiToken: null,
        apiTokenEncryptionIv: null,
        apiTokenEncryptionTag: null,
        apiTokenFingerprint: null,
        pollingLeaseToken: null,
        pollingLeaseExpiresAt: null,
      }),
    }));
  });
});
