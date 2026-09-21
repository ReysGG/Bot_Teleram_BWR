import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  topupFindFirst: vi.fn(),
  transactionFindMany: vi.fn(),
  poll: vi.fn(),
  match: vi.fn(),
  confirmOrder: vi.fn(),
  confirmWallet: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    walletTopup: { findFirst: mocks.topupFindFirst },
    order: { findFirst: vi.fn() },
    shopeePartnerTransaction: { findMany: mocks.transactionFindMany },
  },
}));
vi.mock("@/server/payment/shopee-partner-worker", () => ({
  pollActiveShopeePartnerSessions: mocks.poll,
}));
vi.mock("@/server/payment/shopee-partner-matching", () => ({
  matchShopeePartnerTransaction: mocks.match,
}));
vi.mock("@/server/payment/confirm-payment", () => ({
  confirmOrderPayment: mocks.confirmOrder,
}));
vi.mock("@/server/wallet/topup", () => ({
  confirmWalletTopup: mocks.confirmWallet,
}));

import { refreshShopeePaymentForWalletTopup } from "@/server/payment/shopee-partner-refresh";

const attempt = {
  id: "attempt-1",
  evidenceMode: "WEB_SESSION",
  providerKeySnapshot: "SHOPEE_PARTNER",
  shopeeSessionIdSnapshot: "session-1",
  shopeeAccountFingerprintSnapshot: "a".repeat(64),
  amount: 10047,
  createdAt: new Date("2099-09-08T12:00:00.000Z"),
  expiresAt: new Date("2099-09-08T12:05:00.000Z"),
};

describe("Shopee wallet top-up refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2099-09-08T12:02:00.000Z"));
    mocks.topupFindFirst.mockResolvedValue({
      id: "topup-1",
      status: "PENDING",
      paymentMethod: "DANA_RELAY",
      expiresAt: new Date("2099-09-08T12:05:00.000Z"),
      qrisInvoiceAttempt: attempt,
    });
    mocks.poll.mockResolvedValue({ sessions: 1, pages: 1 });
    mocks.transactionFindMany.mockResolvedValue([
      { externalTransactionId: "shopee-tx-1" },
    ]);
    mocks.match.mockResolvedValue({
      outcome: "MATCHED",
      transactionId: "row-1",
      invoiceAttemptId: "attempt-1",
      target: { kind: "wallet_topup", id: "topup-1" },
    });
    mocks.confirmWallet.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("matches the selected invoice and credits through confirmWalletTopup", async () => {
    const result = await refreshShopeePaymentForWalletTopup({
      invoiceNumber: "TOP-20260908-TEST",
      chatId: "123",
    });

    expect(result.state).toBe("CONFIRMED");
    expect(mocks.poll).toHaveBeenCalledWith(
      new Date("2099-09-08T12:02:00.000Z"),
      {
      sessionId: "session-1",
        forceLookbackMs: 4 * 60 * 1000,
        maxPages: 3,
      },
    );
    expect(mocks.match).toHaveBeenCalledWith({
      merchantAccountFingerprint: "a".repeat(64),
      externalTransactionId: "shopee-tx-1",
      invoiceAttemptId: "attempt-1",
    });
    expect(mocks.confirmWallet).toHaveBeenCalledWith({
      walletTopupId: "topup-1",
      verifiedBy: "shopee-partner-refresh:shopee-tx-1",
      shopeePartnerTransactionId: "shopee-tx-1",
    });
  });

  it("does not poll or credit an expired top-up", async () => {
    mocks.topupFindFirst.mockResolvedValue({
      id: "topup-1",
      status: "PENDING",
      paymentMethod: "DANA_RELAY",
      expiresAt: new Date("2020-01-01T00:00:00.000Z"),
      qrisInvoiceAttempt: attempt,
    });

    const result = await refreshShopeePaymentForWalletTopup({
      invoiceNumber: "TOP-20260908-TEST",
      chatId: "123",
    });

    expect(result.state).toBe("EXPIRED");
    expect(mocks.poll).not.toHaveBeenCalled();
    expect(mocks.confirmWallet).not.toHaveBeenCalled();
  });
});
