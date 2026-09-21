import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  executeRaw: vi.fn(),
  transactionFindFirst: vi.fn(),
  transactionUpdateMany: vi.fn(),
  attemptFindMany: vi.fn(),
  attemptUpdateMany: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    shopeePartnerTransaction: {
      findMany: vi.fn(),
    },
  },
}));
import {
  classifyShopeeInvoiceMatch,
  eligibleShopeeInvoiceCandidates,
  shopeePartnerTransactionBlockReason,
  matchShopeePartnerTransaction,
} from "@/server/payment/shopee-partner-matching";
import { confirmOrderProviderStateTx } from "@/server/payment/confirmation/provider-state";

const account = "a".repeat(64);
const createdAt = new Date("2026-09-06T01:00:00.000Z");
const expiresAt = new Date("2026-09-06T01:05:00.000Z");
const occurredAt = new Date("2026-09-06T01:02:00.000Z");
const now = new Date("2026-09-06T01:03:00.000Z");

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    externalTransactionId: "107097889480042413",
    merchantAccountFingerprint: account,
    service: 1,
    transactionType: 1,
    statusCode: 3,
    amount: 85_039,
    occurredAt,
    status: "RECEIVED",
    qrisInvoiceAttemptId: null,
    ...overrides,
  };
}

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1",
    evidenceMode: "WEB_SESSION",
    providerKeySnapshot: "SHOPEE_PARTNER",
    shopeeAccountFingerprintSnapshot: account,
    amount: 85_039,
    createdAt,
    expiresAt,
    status: "AWAITING_PAYMENT",
    matchedEventId: null,
    order: { id: "order-1", status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
    walletTopup: null,
    ...overrides,
  };
}

describe("Shopee Partner transaction matching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: mocks.executeRaw,
      shopeePartnerTransaction: {
        findFirst: mocks.transactionFindFirst,
        updateMany: mocks.transactionUpdateMany,
      },
      qrisInvoiceAttempt: {
        findMany: mocks.attemptFindMany,
        updateMany: mocks.attemptUpdateMany,
      },
    }));
    mocks.executeRaw.mockResolvedValue(undefined);
    mocks.transactionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.attemptUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("matches only a web-session invoice with the same account, amount, and window", () => {
    expect(eligibleShopeeInvoiceCandidates(transaction(), [candidate()], now)).toHaveLength(1);
    expect(classifyShopeeInvoiceMatch(transaction(), [candidate()], now)).toMatchObject({
      outcome: "MATCHED",
      candidate: { id: "attempt-1" },
    });
  });

  it("fails closed for unmatched and ambiguous active invoices", () => {
    expect(classifyShopeeInvoiceMatch(transaction(), [], now)).toEqual({
      outcome: "UNMATCHED",
      reason: "NO_ACTIVE_INVOICE_MATCH",
    });
    expect(classifyShopeeInvoiceMatch(transaction(), [candidate(), candidate({ id: "attempt-2" })], now)).toEqual({
      outcome: "AMBIGUOUS",
      reason: "MULTIPLE_ACTIVE_INVOICE_MATCHES",
    });
  });

  it("does not let Android-mode, another account, or terminal targets claim the row", () => {
    expect(eligibleShopeeInvoiceCandidates(transaction(), [candidate({ evidenceMode: "ANDROID_NOTIFICATION" })], now)).toHaveLength(0);
    expect(eligibleShopeeInvoiceCandidates(transaction({ statusCode: 2 }), [candidate()], now)).toHaveLength(0);
    expect(eligibleShopeeInvoiceCandidates(transaction(), [candidate({ shopeeAccountFingerprintSnapshot: "b".repeat(64) })], now)).toHaveLength(0);
    expect(eligibleShopeeInvoiceCandidates(transaction(), [candidate({ order: { id: "order-1", status: "PAID", paymentStatus: "PAID" } })], now)).toHaveLength(0);
    expect(eligibleShopeeInvoiceCandidates(transaction(), [candidate()], new Date("2026-09-06T01:06:00.000Z"))).toHaveLength(0);
  });

  it("revalidates the bound transaction before confirmation", () => {
    const attempt = {
      id: "attempt-1",
      evidenceMode: "WEB_SESSION",
      providerKeySnapshot: "SHOPEE_PARTNER",
      shopeeAccountFingerprintSnapshot: account,
      amount: 85_039,
      createdAt,
      expiresAt,
      status: "MATCHED",
    };
    expect(shopeePartnerTransactionBlockReason({
      transaction: transaction({ status: "MATCHED", qrisInvoiceAttemptId: "attempt-1" }),
      invoiceAttempt: attempt,
      now,
    })).toBeNull();
    expect(shopeePartnerTransactionBlockReason({
      transaction: transaction({ amount: 85_040, status: "MATCHED", qrisInvoiceAttemptId: "attempt-1" }),
      invoiceAttempt: attempt,
      now,
    })).toContain("amount mismatch");
    expect(shopeePartnerTransactionBlockReason({
      transaction: transaction({ status: "RECEIVED", qrisInvoiceAttemptId: "attempt-1" }),
      invoiceAttempt: attempt,
      now,
    })).toContain("awaiting confirmation");
    expect(shopeePartnerTransactionBlockReason({
      transaction: transaction({ status: "MATCHED", qrisInvoiceAttemptId: "attempt-1" }),
      invoiceAttempt: { ...attempt, evidenceMode: "ANDROID_NOTIFICATION" },
      now,
    })).toContain("evidence mode");
  });

  it("binds exactly one transaction and invoice atomically", async () => {
    mocks.transactionFindFirst.mockResolvedValue({
      id: "transaction-row-1",
      externalTransactionId: "107097889480042413",
      merchantAccountFingerprint: account,
      service: 1,
      transactionType: 1,
      statusCode: 3,
      amount: 85_039,
      occurredAt,
      status: "RECEIVED",
      qrisInvoiceAttemptId: null,
    });
    mocks.attemptFindMany.mockResolvedValue([candidate()]);
    await expect(matchShopeePartnerTransaction({
      merchantAccountFingerprint: account,
      externalTransactionId: "107097889480042413",
      now,
    })).resolves.toEqual({
      outcome: "MATCHED",
      transactionId: "transaction-row-1",
      invoiceAttemptId: "attempt-1",
      target: { kind: "order", id: "order-1" },
    });
    expect(mocks.attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "attempt-1", status: "AWAITING_PAYMENT" }),
      data: { status: "MATCHED" },
    }));
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "transaction-row-1", qrisInvoiceAttemptId: null }),
      data: expect.objectContaining({ status: "MATCHED", qrisInvoiceAttemptId: "attempt-1" }),
    }));
  });

  it("records unmatched and ambiguous outcomes without binding an invoice", async () => {
    const row = {
      id: "transaction-row-1",
      externalTransactionId: "107097889480042413",
      merchantAccountFingerprint: account,
      service: 1,
      transactionType: 1,
      statusCode: 3,
      amount: 85_039,
      occurredAt,
      status: "RECEIVED",
      qrisInvoiceAttemptId: null,
    };
    mocks.transactionFindFirst.mockResolvedValue(row);
    mocks.attemptFindMany.mockResolvedValue([]);
    await expect(matchShopeePartnerTransaction({
      merchantAccountFingerprint: account,
      externalTransactionId: row.externalTransactionId,
      now,
    })).resolves.toMatchObject({ outcome: "UNMATCHED" });
    expect(mocks.attemptUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "UNMATCHED" }),
    }));

    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      $executeRaw: mocks.executeRaw,
      shopeePartnerTransaction: { findFirst: mocks.transactionFindFirst, updateMany: mocks.transactionUpdateMany },
      qrisInvoiceAttempt: { findMany: mocks.attemptFindMany, updateMany: mocks.attemptUpdateMany },
    }));
    mocks.transactionFindFirst.mockResolvedValue(row);
    mocks.attemptFindMany.mockResolvedValue([candidate(), candidate({ id: "attempt-2" })]);
    await expect(matchShopeePartnerTransaction({
      merchantAccountFingerprint: account,
      externalTransactionId: row.externalTransactionId,
      now,
    })).resolves.toMatchObject({ outcome: "AMBIGUOUS" });
    expect(mocks.attemptUpdateMany).not.toHaveBeenCalled();
  });

  it("closes a bound row when its invoice becomes terminal", async () => {
    const row = {
      id: "transaction-row-terminal",
      externalTransactionId: "107097889480042413",
      merchantAccountFingerprint: account,
      service: 1,
      transactionType: 1,
      statusCode: 3,
      amount: 85_039,
      occurredAt,
      status: "MATCHED",
      qrisInvoiceAttemptId: "attempt-terminal",
      qrisInvoiceAttempt: {
        orderId: "order-1",
        walletTopupId: null,
        status: "EXPIRED",
        expiresAt,
      },
    };
    mocks.transactionFindFirst.mockResolvedValue(row);

    await expect(matchShopeePartnerTransaction({
      merchantAccountFingerprint: account,
      externalTransactionId: row.externalTransactionId,
      now,
    })).resolves.toMatchObject({ outcome: "REJECTED", reason: "INVOICE_TERMINAL" });
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "REJECTED", rejectionReason: "INVOICE_TERMINAL" }),
    }));
  });

  it("reconciles a bound row when its invoice was already confirmed", async () => {
    const row = {
      id: "transaction-row-confirmed",
      externalTransactionId: "107097889480042414",
      merchantAccountFingerprint: account,
      service: 1,
      transactionType: 1,
      statusCode: 3,
      amount: 85_039,
      occurredAt,
      status: "MATCHED",
      qrisInvoiceAttemptId: "attempt-confirmed",
      qrisInvoiceAttempt: {
        orderId: "order-1",
        walletTopupId: null,
        status: "CONFIRMED",
        expiresAt,
      },
    };
    mocks.transactionFindFirst.mockResolvedValue(row);

    await expect(matchShopeePartnerTransaction({
      merchantAccountFingerprint: account,
      externalTransactionId: row.externalTransactionId,
      now,
    })).resolves.toMatchObject({ outcome: "ALREADY_CONFIRMED" });
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CONFIRMED" }),
    }));
  });

  it("transitions the matched Shopee row with the invoice in the confirmation transaction", async () => {
    const tx = {
      qrisInvoiceAttempt: { updateMany: mocks.attemptUpdateMany },
      shopeePartnerTransaction: { updateMany: mocks.transactionUpdateMany },
    } as never;
    await confirmOrderProviderStateTx(tx, {
      paymentMethod: "DANA_RELAY",
      qrisAttemptId: "attempt-1",
      shopeeTransactionId: "transaction-row-1",
      manualJagoConfirmation: false,
      confirmedAt: now,
    });
    expect(mocks.attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ["AWAITING_PAYMENT", "MATCHED"] } }),
    }));
    expect(mocks.transactionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: "transaction-row-1",
        qrisInvoiceAttemptId: "attempt-1",
        status: "MATCHED",
      }),
      data: expect.objectContaining({ status: "CONFIRMED" }),
    }));
  });
});
