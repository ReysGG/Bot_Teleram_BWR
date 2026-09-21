import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    binanceWebSession: {
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

import {
  createBinanceWebSession,
  revokeBinanceWebSession,
} from "@/server/payment/binance-web-session";

const cookie = {
  domain: ".binance.com",
  expirationDate: 2_000_000_000,
  name: "session_test",
  path: "/",
  secure: true,
  value: "redacted-binance-session",
};

describe("Binance web session lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYMENT_SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
    mocks.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "session-1",
      name: data.name,
      cookieFingerprint: data.cookieFingerprint,
      recipientBinanceId: data.recipientBinanceId,
      accountFingerprint: null,
      status: data.status,
      isPrimary: false,
      lastValidatedAt: null,
      lastSuccessfulPollAt: null,
      lastErrorCode: null,
      lastErrorAt: null,
      activatedAt: null,
      activatedBy: null,
      revokedAt: null,
      revokedBy: null,
      createdBy: data.createdBy,
      updatedBy: data.updatedBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    mocks.update.mockResolvedValue({ id: "session-1", status: "REVOKED" });
  });

  it("stores cookies encrypted and leaves a new session pending", async () => {
    await createBinanceWebSession({
      name: "Primary Binance",
      cookieExport: [cookie],
      recipientBinanceId: "567896636",
      actor: "admin:owner@example.test",
    });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.status).toBe("PENDING_VALIDATION");
    expect(data.recipientBinanceId).toBe("567896636");
    expect(data.encryptedCookieJar).not.toContain(cookie.value);
    expect(data.cookieFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(data).not.toHaveProperty("accountFingerprint");
  });

  it("scrubs ciphertext, leases, cursor, and primary state on revoke", async () => {
    await revokeBinanceWebSession("session-1", "admin:owner@example.test");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-1" },
      data: expect.objectContaining({
        status: "REVOKED",
        isPrimary: false,
        encryptedCookieJar: null,
        cookieEncryptionIv: null,
        cookieEncryptionTag: null,
        cookieFingerprint: null,
        pollingLeaseToken: null,
        pollingLeaseExpiresAt: null,
        pollCursorTime: null,
      }),
    }));
  });
});
