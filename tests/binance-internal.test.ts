import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    binanceInternalPaymentAttempt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  confirmOrderPayment: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/payment/confirm-payment", () => ({
  confirmOrderPayment: mocks.confirmOrderPayment,
}));

import {
  binanceOrderIdAliases,
  canonicalBinanceTransactionId,
  createBinancePayApiClient,
  normalizeBinanceOrderId,
  processPendingBinanceInternalAttempts,
  signBinanceQuery,
  verifyBinanceInternalAttempt,
  type BinancePayApiClient,
} from "@/server/payment/binance-internal";
import {
  allocateBinanceInternalUniqueMicros,
  parsePositiveUsdtMicros,
} from "@/server/payment/binance-internal-amount";
import { binanceInternalAttemptBlocksOrderClosure } from "@/server/payment/binance-internal-policy";
import {
  getBinanceInternalSetting,
  normalizeBinanceRecipientId,
  setBinanceInternalSetting,
} from "@/server/payment/binance-internal-setting";

const CREATED_AT = new Date("2026-08-18T03:00:00.000Z");
const EXPIRES_AT = new Date("2026-08-18T03:05:00.000Z");
const ORDER_ID = "1234567890123456789";
const RECIPIENT_ID = "567896636";

function attempt(id = "attempt-1") {
  return {
    id,
    orderId: `order-${id}`,
    rateSnapshot: 18_500,
    baseUsdtMicros: 5_000_000n,
    uniqueMicros: 1,
    expectedUsdtMicros: 5_000_001n,
    recipientBinanceIdSnapshot: RECIPIENT_ID,
    status: "VERIFYING",
    submittedOrderId: ORDER_ID,
    canonicalTransactionId: ORDER_ID,
    observedAmount: null,
    observedCurrency: null,
    observedOrderType: null,
    observedProviderStatus: null,
    observedWalletTypes: null,
    observedPayerName: null,
    observedReceiverBinanceId: null,
    observedReceiverName: null,
    observedTransactionTime: null,
    submittedAt: new Date("2026-08-18T03:02:00.000Z"),
    lastCheckedAt: null,
    verifiedAt: null,
    confirmedAt: null,
    failureReason: null,
    expiresAt: EXPIRES_AT,
    verificationExpiresAt: new Date("2099-08-18T04:05:00.000Z"),
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    order: {
      id: `order-${id}`,
      payment: { method: "BINANCE_INTERNAL" },
    },
  };
}

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    orderType: "C2C",
    transactionId: ORDER_ID,
    transactionTime: new Date("2026-08-18T03:03:00.000Z").getTime(),
    amount: "5.000001",
    currency: "USDT",
    walletTypes: [1, 2],
    payerInfo: { name: "Buyer" },
    receiverInfo: { binanceId: RECIPIENT_ID, name: "Store" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.$transaction.mockImplementation(async callback => callback(mocks.prisma));
  mocks.prisma.binanceInternalPaymentAttempt.findFirst.mockResolvedValue(null);
  mocks.prisma.binanceInternalPaymentAttempt.findUnique.mockResolvedValue(
    attempt(),
  );
  mocks.prisma.binanceInternalPaymentAttempt.updateMany.mockResolvedValue({
    count: 1,
  });
  mocks.confirmOrderPayment.mockResolvedValue({ id: "order-attempt-1" });
});

afterEach(() => {
  delete process.env.BINANCE_ORDER_ID_PREFIX;
  delete process.env.BINANCE_WEB_SESSION_CHECKOUT_ENABLED;
});

describe("signed Binance Pay history client", () => {
  function clientFor(payload: unknown) {
    return createBinancePayApiClient({
      apiKey: "test-key",
      apiSecret: "test-secret",
      baseUrl: "https://api.binance.test",
      fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify(payload))),
    });
  }

  it("accepts the documented successful history envelope", async () => {
    await expect(clientFor({ code: "000000", success: true, data: [transaction()] })
      .listTransactions({ startTime: 100, endTime: 200 })).resolves.toEqual([transaction()]);
  });

  it.each([
    { code: "000000", success: false, data: [transaction()] },
    { code: "100001", success: true, data: [transaction()] },
    { data: [transaction()] },
    { code: "000000", success: true, data: [null] },
    { code: "000000", success: true, data: [transaction({ transactionId: 1234567890123456789 })] },
    null,
  ])("rejects failed or malformed history without trusting HTTP 200", async (payload) => {
    await expect(clientFor(payload).listTransactions({ startTime: 100, endTime: 200 }))
      .rejects.toThrow();
  });

  it("signs the raw query and sends the API key only in the required header", async () => {
    let capturedUrl = "";
    let capturedApiKey = "";
    const fetchImpl = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedApiKey = String((init?.headers as Record<string, string>)["X-MBX-APIKEY"]);
      return new Response(JSON.stringify([transaction()]), { status: 200 });
    }) as typeof fetch;
    const client = createBinancePayApiClient({
      apiKey: "read-only-key",
      apiSecret: "secret-value",
      baseUrl: "https://api.binance.test",
      fetchImpl,
      now: () => 1_700_000_000_000,
    });
    await client.listTransactions({ startTime: 100, endTime: 200, limit: 100 });
    const url = new URL(capturedUrl);
    const signature = url.searchParams.get("signature");
    url.searchParams.delete("signature");
    expect(signature).toBe(signBinanceQuery(url.searchParams.toString(), "secret-value"));
    expect(capturedApiKey).toBe("read-only-key");
    expect(capturedUrl).not.toContain("secret-value");
    expect(url.pathname).toBe("/sapi/v1/pay/transactions");
  });
});

describe("Binance internal transaction verification", () => {
  it("matches a numeric app receipt to the documented M_P_ history ID", async () => {
    const result = await verifyBinanceInternalAttempt({
      attemptId: "attempt-1",
      apiClient: { listTransactions: async () => [transaction({ transactionId: `M_P_${ORDER_ID}` })] },
    });
    expect(result.outcome).toBe("CONFIRMED");
  });

  it("matches the app orderId while binding the distinct provider transactionId", async () => {
    const providerId = "9234567890123456789";
    const result = await verifyBinanceInternalAttempt({attemptId:"attempt-1",transactions:[transaction({orderId:ORDER_ID,transactionId:providerId})]});
    expect(result.outcome).toBe("CONFIRMED");
    expect(mocks.prisma.binanceInternalPaymentAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({canonicalTransactionId:providerId,status:"VERIFIED"})}));
    expect(mocks.confirmOrderPayment).toHaveBeenCalledWith(expect.objectContaining({verifiedBy:`binance-internal:${providerId}`}));
  });
  it("blocks another invoice from reusing the same payment through its other ID", async () => {
    mocks.prisma.binanceInternalPaymentAttempt.findFirst.mockResolvedValue({id:"other-attempt"});
    const result=await verifyBinanceInternalAttempt({attemptId:"attempt-1",transactions:[transaction({orderId:ORDER_ID,transactionId:"9234567890123456789"})]});
    expect(result.outcome).toBe("REJECTED");
    expect(mocks.confirmOrderPayment).not.toHaveBeenCalled();
  });
  it("does not coerce numeric orderIds beyond JavaScript's safe integer range", async () => {
    const result=await verifyBinanceInternalAttempt({attemptId:"attempt-1",transactions:[transaction({orderId:Number(ORDER_ID),transactionId:"9234567890123456789"})]});
    expect(result.outcome).toBe("PENDING_PROVIDER");
    expect(mocks.confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("rejects ambiguous receipt aliases instead of selecting a transaction", async () => {
    const result = await verifyBinanceInternalAttempt({
      attemptId: "attempt-1",
      apiClient: { listTransactions: async () => [transaction(), transaction({ transactionId: `M_P_${ORDER_ID}` })] },
    });
    expect(result.outcome).toBe("REJECTED");
    expect(mocks.confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("keeps the invoice pending when the provider is unavailable", async () => {
    const result = await verifyBinanceInternalAttempt({
      attemptId: "attempt-1",
      apiClient: { listTransactions: async () => { throw new Error("unavailable"); } },
    });
    expect(result.outcome).toBe("PENDING_PROVIDER");
    expect(mocks.confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("confirms exact positive USDT income without requiring a provider status field", async () => {
    const apiClient: BinancePayApiClient = {
      listTransactions: vi.fn().mockResolvedValue([transaction()]),
    };
    await expect(
      verifyBinanceInternalAttempt({ attemptId: "attempt-1", apiClient }),
    ).resolves.toEqual({ outcome: "CONFIRMED" });
    expect(mocks.prisma.binanceInternalPaymentAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "VERIFIED",
          observedProviderStatus: null,
        }),
      }),
    );
    expect(mocks.confirmOrderPayment).toHaveBeenCalledWith({
      orderId: "order-attempt-1",
      verifiedBy: `binance-internal:${ORDER_ID}`,
      binanceInternalAttemptId: "attempt-1",
    });
  });

  it.each([
    ["negative expenditure", { amount: "-5.000001" }],
    ["wrong amount", { amount: "5.000002" }],
    ["wrong currency", { currency: "FDUSD" }],
    ["wrong receiver", { receiverInfo: { binanceId: "987654321" } }],
    ["unsupported order type", { orderType: "MERCHANT" }],
    ["outside invoice time", { transactionTime: EXPIRES_AT.getTime() + 1 }],
  ])("rejects %s", async (_label, overrides) => {
    const result = await verifyBinanceInternalAttempt({
      attemptId: "attempt-1",
      apiClient: { listTransactions: async () => [transaction(overrides)] },
    });
    expect(result.outcome).toBe("REJECTED");
    expect(mocks.confirmOrderPayment).not.toHaveBeenCalled();
  });

  it("fetches one shared weight-3000 history batch for multiple attempts", async () => {
    const second = {
      ...attempt("attempt-2"),
      submittedOrderId: "2234567890123456789",
      canonicalTransactionId: "2234567890123456789",
    };
    mocks.prisma.binanceInternalPaymentAttempt.findMany.mockResolvedValue([
      { id: "attempt-1", status: "VERIFYING", createdAt: CREATED_AT, verificationExpiresAt: new Date("2099-01-01") },
      { id: "attempt-2", status: "VERIFYING", createdAt: CREATED_AT, verificationExpiresAt: new Date("2099-01-01") },
    ]);
    mocks.prisma.binanceInternalPaymentAttempt.findUnique.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "attempt-2" ? second : attempt(),
    );
    const apiClient: BinancePayApiClient = {
      listTransactions: vi.fn().mockResolvedValue([
        transaction(),
        transaction({ transactionId: second.canonicalTransactionId }),
      ]),
    };
    await processPendingBinanceInternalAttempts(25, apiClient);
    expect(apiClient.listTransactions).toHaveBeenCalledTimes(1);
    expect(mocks.confirmOrderPayment).toHaveBeenCalledTimes(2);
  });
});

describe("Binance identifiers, amounts, and lifecycle", () => {
  it("treats numeric and M_P_ receipt aliases as one identity without losing digits", () => {
    const receipt = "4524974695110983001";
    expect(binanceOrderIdAliases(receipt).sort()).toEqual([receipt, `M_P_${receipt}`].sort());
    expect(binanceOrderIdAliases(`M_P_${receipt}`).sort()).toEqual([receipt, `M_P_${receipt}`].sort());
    expect(binanceOrderIdAliases(`other_${receipt}`)).toEqual([`other_${receipt}`]);
  });

  it("uses exact IDs by default and an explicit prefix mapping when configured", () => {
    expect(normalizeBinanceOrderId(` ${ORDER_ID} `)).toBe(ORDER_ID);
    expect(canonicalBinanceTransactionId(ORDER_ID)).toBe(ORDER_ID);
    process.env.BINANCE_ORDER_ID_PREFIX = "M_P_";
    expect(canonicalBinanceTransactionId(ORDER_ID)).toBe(`M_P_${ORDER_ID}`);
    expect(canonicalBinanceTransactionId(`M_P_${ORDER_ID}`)).toBe(
      `M_P_${ORDER_ID}`,
    );
  });

  it("parses only positive exact micro-USDT income", () => {
    expect(parsePositiveUsdtMicros("5.000001")).toBe(5_000_001n);
    expect(parsePositiveUsdtMicros("5.00000100")).toBe(5_000_001n);
    expect(parsePositiveUsdtMicros("-5.000001")).toBeNull();
    expect(parsePositiveUsdtMicros("5.00000101")).toBeNull();
  });

  it("allocates a different active micro suffix", async () => {
    const tx = {
      $executeRaw: vi.fn(),
      binanceInternalPaymentAttempt: {
        findMany: vi.fn().mockResolvedValue([
          { expectedUsdtMicros: 5_000_001n },
          { expectedUsdtMicros: 5_000_002n },
        ]),
      },
    } as never;
    await expect(
      allocateBinanceInternalUniqueMicros(tx, 5_000_000),
    ).resolves.toEqual({ uniqueMicros: 3, expectedUsdtMicros: 5_000_003n });
  });

  it("blocks cancellation only during bounded verification or after verification", () => {
    const now = new Date("2026-08-18T03:00:00Z");
    expect(
      binanceInternalAttemptBlocksOrderClosure(
        { status: "VERIFYING", verificationExpiresAt: new Date("2026-08-18T03:01:00Z") },
        now,
      ),
    ).toBe(true);
    expect(
      binanceInternalAttemptBlocksOrderClosure(
        { status: "VERIFYING", verificationExpiresAt: new Date("2026-08-18T02:59:00Z") },
        now,
      ),
    ).toBe(false);
    expect(
      binanceInternalAttemptBlocksOrderClosure(
        { status: "VERIFIED", verificationExpiresAt: new Date("2026-08-18T02:59:00Z") },
        now,
      ),
    ).toBe(true);
  });
});

describe("Binance internal runtime setting", () => {
  it("does not invent a recipient and requires one before enabling", async () => {
    const client = {
      storeRuntimeSetting: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    } as never;
    await expect(getBinanceInternalSetting(client)).resolves.toMatchObject({
      enabled: false,
      recipientId: null,
    });
    await expect(
      setBinanceInternalSetting({ enabled: true, actor: "admin:test" }, client),
    ).rejects.toThrow("wajib diisi");
    expect(normalizeBinanceRecipientId(` ${RECIPIENT_ID} `)).toBe(RECIPIENT_ID);
  });

  it("selects a validated primary web session when API credentials are absent", async () => {
    process.env.BINANCE_WEB_SESSION_CHECKOUT_ENABLED = "true";
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_API_SECRET;
    const client = {
      storeRuntimeSetting: {
        findUnique: vi.fn().mockResolvedValue({
          binanceInternalEnabled: true,
          binanceInternalRecipientId: RECIPIENT_ID,
          binanceInternalUpdatedAt: null,
          binanceInternalUpdatedBy: null,
        }),
      },
      binanceWebSession: {
        findFirst: vi.fn().mockResolvedValue({
          id: "session-1",
          name: "Primary Binance",
          accountFingerprint: "a".repeat(64),
          lastValidatedAt: new Date(),
          lastSuccessfulPollAt: new Date(),
        }),
      },
    } as never;
    await expect(getBinanceInternalSetting(client)).resolves.toMatchObject({
      verifierMode: "WEB_SESSION",
      verifierReady: true,
      web: { ready: true, sessionId: "session-1" },
      api: { configured: false },
    });
  });
});
