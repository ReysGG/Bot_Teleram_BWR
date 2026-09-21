import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  match: vi.fn(),
  confirmOrder: vi.fn(),
  confirmWallet: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    shopeePartnerTransaction: { findMany: mocks.findMany },
  },
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

import { processPendingShopeePartnerPayments } from "@/server/payment/shopee-partner-payment-worker";

describe("Shopee Partner payment worker", () => {
  const originalAutoConfirm = process.env.SHOPEE_WEB_SESSION_AUTO_CONFIRM;
  const originalPaymentExpiry = process.env.PAYMENT_EXPIRY_MINUTES;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SHOPEE_WEB_SESSION_AUTO_CONFIRM = "true";
    process.env.PAYMENT_EXPIRY_MINUTES = "5";
    mocks.findMany.mockResolvedValue([
      { merchantAccountFingerprint: "a".repeat(64), externalTransactionId: "tx-order" },
      { merchantAccountFingerprint: "a".repeat(64), externalTransactionId: "tx-wallet" },
      { merchantAccountFingerprint: "a".repeat(64), externalTransactionId: "tx-unmatched" },
    ]);
    mocks.match.mockImplementation(async ({ externalTransactionId }: { externalTransactionId: string }) => {
      if (externalTransactionId === "tx-order") {
        return {
          outcome: "MATCHED",
          transactionId: "row-order",
          invoiceAttemptId: "attempt-order",
          target: { kind: "order", id: "order-1" },
        };
      }
      if (externalTransactionId === "tx-wallet") {
        return {
          outcome: "MATCHED",
          transactionId: "row-wallet",
          invoiceAttemptId: "attempt-wallet",
          target: { kind: "wallet_topup", id: "topup-1" },
        };
      }
      return { outcome: "UNMATCHED", transactionId: "row-unmatched", reason: "NO_ACTIVE_INVOICE_MATCH" };
    });
    mocks.confirmOrder.mockResolvedValue({});
    mocks.confirmWallet.mockResolvedValue({});
  });

  afterAll(() => {
    if (originalAutoConfirm === undefined) delete process.env.SHOPEE_WEB_SESSION_AUTO_CONFIRM;
    else process.env.SHOPEE_WEB_SESSION_AUTO_CONFIRM = originalAutoConfirm;
    if (originalPaymentExpiry === undefined) delete process.env.PAYMENT_EXPIRY_MINUTES;
    else process.env.PAYMENT_EXPIRY_MINUTES = originalPaymentExpiry;
  });

  it("confirms only explicitly matched web-session order and wallet targets", async () => {
    await expect(processPendingShopeePartnerPayments(10, new Date("2026-09-06T01:03:00.000Z")))
      .resolves.toMatchObject({ scanned: 3, matched: 2, confirmed: 2, unmatched: 1, errors: 0 });
    expect(mocks.confirmOrder).toHaveBeenCalledWith({
      orderId: "order-1",
      verifiedBy: "shopee-partner:tx-order",
      shopeePartnerTransactionId: "tx-order",
    });
    expect(mocks.confirmWallet).toHaveBeenCalledWith({
      walletTopupId: "topup-1",
      verifiedBy: "shopee-partner:tx-wallet",
      shopeePartnerTransactionId: "tx-wallet",
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS", "MATCHED"] },
        occurredAt: { gte: new Date("2026-09-06T00:52:00.000Z") },
      },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    }));
  });

  it("shares one matching pass when scheduler calls overlap", async () => {
    let releaseRows!: (rows: []) => void;
    mocks.findMany.mockImplementationOnce(() => new Promise<[]>(
      (resolve) => { releaseRows = resolve; },
    ));

    const now = new Date("2026-09-06T01:03:00.000Z");
    const first = processPendingShopeePartnerPayments(25, now);
    const second = processPendingShopeePartnerPayments(25, now);

    expect(second).toBe(first);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    releaseRows([]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ scanned: 0, errors: 0 }),
      expect.objectContaining({ scanned: 0, errors: 0 }),
    ]);
  });

  it("leaves a matched row retryable when payment confirmation cannot commit", async () => {
    mocks.confirmOrder.mockRejectedValue(new Error("stock contention"));
    await expect(processPendingShopeePartnerPayments()).resolves.toMatchObject({
      matched: 2,
      confirmed: 1,
      errors: 1,
    });
  });

  it("never performs financial confirmation while the cutover gate is disabled", async () => {
    process.env.SHOPEE_WEB_SESSION_AUTO_CONFIRM = "false";
    await expect(processPendingShopeePartnerPayments()).resolves.toMatchObject({
      matched: 2,
      confirmed: 0,
      errors: 0,
    });
    expect(mocks.confirmOrder).not.toHaveBeenCalled();
    expect(mocks.confirmWallet).not.toHaveBeenCalled();
  });
});
