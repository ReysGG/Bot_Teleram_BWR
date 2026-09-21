import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db/prisma";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { submitBinanceInternalOrderId } from "@/server/payment/binance-internal";
import { matchBinanceWebAttempt } from "@/server/payment/binance-web-matching";
import { binanceWebAccountFingerprint } from "@/server/payment/binance-web-session";
import { recordBinanceWebPollMetric } from "@/server/payment/binance-web-metrics";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { approveOrderPaymentManually } from "@/server/payment/admin-manual-approval";
import { soldUnitsByProduct } from "@/server/storefront/sales-count";
import { ERC20_TRANSFER_TOPIC, submitUsdtBep20Transaction, type BscRpcClient } from "@/server/payment/usdt-bep20";

vi.mock("@/server/telegram/product-broadcast", () => ({ enqueueProductSoldOut: vi.fn() }));

const databaseDescribe = process.env.RUN_PAYMENT_PROVIDER_DB_TESTS === "1" ? describe : describe.skip;
const orderIds: string[] = [];
const productIds: string[] = [];
const binanceSessionIds: string[] = [];
const recipient = `0x${"1".repeat(40)}`;
const token = `0x${"2".repeat(40)}`;
const binanceId = "123456789";
let sequence = 0;

async function fixture(method: "BINANCE_INTERNAL" | "USDT_BEP20") {
  const uniqueMicros = ++sequence;
  const expectedUsdtMicros = 5_000_000n + BigInt(uniqueMicros);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const verificationExpiresAt = new Date(expiresAt.getTime() + 60 * 60_000);
  const product = await prisma.product.create({ data: {
    slug: `provider-audit-${randomUUID()}`, name: "Disposable payment test", description: "Test only", price: 92_500,
  } });
  productIds.push(product.id);
  await prisma.digitalStockItem.create({ data: {
    productId: product.id, originalFilename: "test.txt", credentialFingerprint: randomUUID(),
    encryptedPayload: "test-encrypted", encryptionIv: "test-iv", encryptionTag: "test-tag",
    status: "AVAILABLE", healthStatus: "HEALTHY",
  } });
  const order = await prisma.order.create({ data: {
    idempotencyKey: `provider-audit-${randomUUID()}`, invoiceNumber: `TEST-${randomUUID()}`,
    chatId: `provider-audit-${randomUUID()}`, subtotal: 92_500, serviceFee: 0, grandTotal: 92_500,
    expiresAt,
    items: { create: { productId: product.id, productNameSnapshot: product.name, unitPrice: 92_500 } },
    payment: { create: { invoiceNumber: `TEST-PAY-${randomUUID()}`, method, billedAmount: 92_500, expiresAt } },
  } });
  orderIds.push(order.id);
  const common = { orderId: order.id, rateSnapshot: 18_500, baseUsdtMicros: 5_000_000n,
    uniqueMicros, expectedUsdtMicros, expiresAt, verificationExpiresAt };
  const attempt = method === "BINANCE_INTERNAL"
    ? await prisma.binanceInternalPaymentAttempt.create({ data: { ...common, recipientBinanceIdSnapshot: binanceId } })
    : await prisma.usdtBep20Attempt.create({ data: { ...common, recipientAddressSnapshot: recipient,
        tokenContractSnapshot: token, tokenDecimalsSnapshot: 18, chainIdSnapshot: 56,
        requiredConfirmationsSnapshot: 12, expectedTokenUnits: (expectedUsdtMicros * 10n ** 12n).toString() } });
  return { order, product, attempt, expectedUsdtMicros };
}

async function binanceWebFixture() {
  const uniqueMicros = ++sequence;
  const expectedUsdtMicros = 5_000_000n + BigInt(uniqueMicros);
  const expiresAt = new Date(Date.now() + 30 * 60_000);
  const verificationExpiresAt = new Date(expiresAt.getTime() + 60 * 60_000);
  const product = await prisma.product.create({ data: {
    slug: `provider-web-audit-${randomUUID()}`,
    name: "Disposable Binance web test",
    description: "Test only",
    price: 92_500,
  } });
  productIds.push(product.id);
  await prisma.digitalStockItem.create({ data: {
    productId: product.id,
    originalFilename: "test.txt",
    credentialFingerprint: randomUUID(),
    encryptedPayload: "test-encrypted",
    encryptionIv: "test-iv",
    encryptionTag: "test-tag",
    status: "AVAILABLE",
    healthStatus: "HEALTHY",
  } });
  const order = await prisma.order.create({ data: {
    idempotencyKey: `provider-web-audit-${randomUUID()}`,
    invoiceNumber: `TEST-WEB-${randomUUID()}`,
    chatId: `provider-web-audit-${randomUUID()}`,
    subtotal: 92_500,
    serviceFee: 0,
    grandTotal: 92_500,
    expiresAt,
    items: { create: { productId: product.id, productNameSnapshot: product.name, unitPrice: 92_500 } },
    payment: { create: { invoiceNumber: `TEST-WEB-PAY-${randomUUID()}`, method: "BINANCE_INTERNAL", billedAmount: 92_500, expiresAt } },
  } });
  orderIds.push(order.id);
  const accountFingerprint = binanceWebAccountFingerprint(binanceId);
  const session = await prisma.binanceWebSession.create({ data: {
    name: `Disposable session ${randomUUID()}`,
    encryptedCookieJar: "encrypted-test",
    cookieEncryptionIv: "iv-test",
    cookieEncryptionTag: "tag-test",
    cookieFingerprint: randomUUID(),
    recipientBinanceId: binanceId,
    accountFingerprint,
    status: "ACTIVE",
    lastValidatedAt: new Date(),
    createdBy: "test",
    updatedBy: "test",
  } });
  binanceSessionIds.push(session.id);
  const receipt = `${Date.now()}${String(sequence).padStart(3, "0")}`;
  const attempt = await prisma.binanceInternalPaymentAttempt.create({ data: {
    orderId: order.id,
    rateSnapshot: 18_500,
    baseUsdtMicros: 5_000_000n,
    uniqueMicros,
    expectedUsdtMicros,
    recipientBinanceIdSnapshot: binanceId,
    verifierMode: "WEB_SESSION",
    binanceWebSessionIdSnapshot: session.id,
    binanceAccountFingerprintSnapshot: accountFingerprint,
    status: "VERIFYING",
    submittedOrderId: receipt,
    canonicalTransactionId: receipt,
    submittedAt: new Date(),
    expiresAt,
    verificationExpiresAt,
  } });
  const transaction = await prisma.binanceWebTransaction.create({ data: {
    sessionId: session.id,
    accountFingerprint,
    providerTransactionId: `provider-${randomUUID()}`,
    providerOrderId: receipt,
    transactionType: "C2C",
    direction: "INCOME",
    providerStatus: "SUCCESS",
    currency: "USDT",
    amountMicros: expectedUsdtMicros,
    counterpartyName: "Disposable buyer",
    receiverBinanceId: binanceId,
    occurredAt: new Date(),
    rawPayloadHash: "a".repeat(64),
  } });
  return { order, attempt, transaction };
}

async function expectOneFulfillment(orderId: string) {
  expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } }))
    .toMatchObject({ paymentStatus: "PAID", status: "FULFILLING" });
  expect(await prisma.digitalStockItem.count({ where: { reservedOrderId: orderId, status: "RESERVED" } })).toBe(1);
  expect(await prisma.telegramNotification.count({ where: { orderId, kind: "PAYMENT_SUCCESS" } })).toBe(1);
  expect(await prisma.telegramNotification.count({ where: { orderId, kind: "DIGITAL_FILE" } })).toBe(1);
}

databaseDescribe("payment providers on disposable PostgreSQL", () => {
  beforeAll(() => {
    const url = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/test|audit/.test(url.pathname)) {
      throw new Error("Provider integration tests require a disposable local test/audit database");
    }
  });
  afterAll(async () => {
    if (orderIds.length > 0) {
      await prisma.telegramNotification.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.binanceWebTransaction.deleteMany({ where: { binanceInternalPaymentAttempt: { orderId: { in: orderIds } } } });
      await prisma.binanceInternalPaymentAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.usdtBep20Attempt.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.digitalStockItem.deleteMany({ where: { productId: { in: productIds } } });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (binanceSessionIds.length > 0) {
      await prisma.binanceWebTransaction.deleteMany({ where: { sessionId: { in: binanceSessionIds } } });
      await prisma.binanceWebPollMetric.deleteMany({ where: { sessionId: { in: binanceSessionIds } } });
      await prisma.binanceWebSession.deleteMany({ where: { id: { in: binanceSessionIds } } });
    }
    await prisma.$disconnect();
  });

  it("allows only one invoice to claim numeric/prefixed Binance aliases concurrently", async () => {
    const fixtures = await Promise.all([fixture("BINANCE_INTERNAL"), fixture("BINANCE_INTERNAL")]);
    const receipt = "4524974695110983001";
    const results = await Promise.allSettled(fixtures.map(({ order }, index) => submitBinanceInternalOrderId({
      orderId: order.id, chatId: order.chatId, submittedOrderId: index === 0 ? receipt : `M_P_${receipt}`,
      apiClient: { listTransactions: async () => [] },
    })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: "ORDER_ID_ALREADY_USED" });
  });

  it("does not block a second Telegram checkout solely because another invoice is active", async () => {
    const { order, product } = await fixture("BINANCE_INTERNAL");
    await expect(createDigitalOrder({ chatId: order.chatId, productId: product.id,
      idempotencyKey: `blocked-${randomUUID()}`, paymentMethod: "WALLET" }))
      .rejects.toThrow(/Saldo wallet/);
  });

  it("verifies the Binance app Order ID and queues one delivery under concurrent retries", async () => {
    const { order, attempt, expectedUsdtMicros } = await fixture("BINANCE_INTERNAL");
    const receipt = "5524974695110983686";
    const apiClient = { listTransactions: async () => [{
      transactionId: `M_P_${receipt}`, transactionTime: Date.now(), orderType: "C2C", currency: "USDT",
      amount: `5.${String(expectedUsdtMicros % 1_000_000n).padStart(6, "0")}`,
      receiverInfo: { binanceId },
    }] };
    await Promise.all(Array.from({ length: 6 }, (_, index) => submitBinanceInternalOrderId({
      orderId: order.id, chatId: order.chatId, submittedOrderId: index % 2 ? `M_P_${receipt}` : receipt, apiClient,
    })));
    expect(await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ status: "CONFIRMED" });
    await expectOneFulfillment(order.id);
  }, 30_000);

  it("binds distinct app orderId and transactionId once across retries and alternate-ID claims", async () => {
    const {order,attempt,expectedUsdtMicros}=await fixture("BINANCE_INTERNAL");
    const appId="6624974695110983686", providerId="7724974695110983686";
    const apiClient={listTransactions:async()=>[{orderId:appId,transactionId:providerId,transactionTime:Date.now(),orderType:"C2C",currency:"USDT",amount:`5.${String(expectedUsdtMicros%1_000_000n).padStart(6,"0")}`,receiverInfo:{binanceId}}]};
    await Promise.all(Array.from({length:5},()=>submitBinanceInternalOrderId({orderId:order.id,chatId:order.chatId,submittedOrderId:appId,apiClient})));
    expect(await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({where:{id:attempt.id}})).toMatchObject({status:"CONFIRMED",submittedOrderId:appId,canonicalTransactionId:providerId});
    await expectOneFulfillment(order.id);
    const second=await fixture("BINANCE_INTERNAL");
    await expect(submitBinanceInternalOrderId({orderId:second.order.id,chatId:second.order.chatId,submittedOrderId:providerId,apiClient})).rejects.toMatchObject({code:"ORDER_ID_ALREADY_USED"});
    expect(await prisma.telegramNotification.count({where:{orderId:second.order.id}})).toBe(0);
  },30_000);

  it("claims one Binance web transaction and queues one delivery under concurrent retries", async () => {
    const { order, attempt, transaction } = await binanceWebFixture();
    await expect(prisma.binanceWebTransaction.update({
      where: { id: transaction.id },
      data: { status: "CONFIRMED" },
    })).rejects.toThrow();
    const matches = await Promise.all(
      Array.from({ length: 6 }, () => matchBinanceWebAttempt({ attemptId: attempt.id })),
    );
    expect(matches.every((result) => result.outcome === "MATCHED")).toBe(true);
    await Promise.all(Array.from({ length: 6 }, () => confirmOrderPayment({
      orderId: order.id,
      verifiedBy: `binance-web:${transaction.id}`,
      binanceInternalAttemptId: attempt.id,
    })));
    expect(await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ status: "CONFIRMED" });
    expect(await prisma.binanceWebTransaction.findUniqueOrThrow({ where: { id: transaction.id } }))
      .toMatchObject({ status: "CONFIRMED", binanceInternalPaymentAttemptId: attempt.id });
    await expectOneFulfillment(order.id);
  }, 30_000);

  it("aggregates Binance web poll success and error rate in one five-minute bucket", async () => {
    const { attempt } = await binanceWebFixture();
    const sessionId = (await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({
      where: { id: attempt.id },
      select: { binanceWebSessionIdSnapshot: true },
    })).binanceWebSessionIdSnapshot!;
    const now = new Date("2026-09-08T10:07:00.000Z");
    const base = {
      pages: 1,
      received: 0,
      detailCalls: 0,
      unauthorized: 0,
      rateLimited: 0,
      challenged: 0,
      contractUnknown: 0,
      accountMismatch: 0,
      identityUnproven: 0,
      errors: 0,
    };
    await recordBinanceWebPollMetric({ sessionId, counters: base, now });
    await recordBinanceWebPollMetric({
      sessionId,
      counters: { ...base, unauthorized: 1 },
      now: new Date(now.getTime() + 30_000),
    });
    expect(await prisma.binanceWebPollMetric.findFirstOrThrow({
      where: { sessionId },
    })).toMatchObject({
      runs: 2,
      successfulRuns: 1,
      failedRuns: 1,
      unauthorized: 1,
      lastErrorCode: "AUTH_REQUIRED",
    });
  });

  it.each(["BINANCE_INTERNAL", "USDT_BEP20"] as const)("does not manually confirm an unverified %s invoice", async (method) => {
    const { order } = await fixture(method);
    await expect(confirmOrderPayment({ orderId: order.id, verifiedBy: "admin:test" })).rejects.toThrow(/verified/);
    expect(await prisma.telegramNotification.count({ where: { orderId: order.id } })).toBe(0);
  });

  it.each(["BINANCE_INTERNAL", "USDT_BEP20"] as const)("records explicit manual %s approval through the shared payment transition exactly once", async method => {
    const { order, attempt, product } = await fixture(method);
    const reference = method === "USDT_BEP20" ? "0x" + "b".repeat(64) : "manual_receipt_20260920";
    expect((await soldUnitsByProduct([product.id])).get(product.id) ?? 0).toBe(0);
    const manualCryptoApproval = { reference, reason: "Verified exact amount and recipient outside the unavailable API" };
    await approveOrderPaymentManually({ orderId: order.id, adminEmail: "operator@example.test", manualCryptoApproval });
    await Promise.all(Array.from({ length: 4 }, () => confirmOrderPayment({ orderId: order.id, verifiedBy: "admin:operator@example.test", manualCryptoApproval })));
    await expectOneFulfillment(order.id);
    const stored = method === "USDT_BEP20"
      ? await prisma.usdtBep20Attempt.findUniqueOrThrow({ where: { id: attempt.id } })
      : await prisma.binanceInternalPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect(stored.status).toBe("CONFIRMED");
    expect(stored.verifiedAt).toBeNull();
    expect(stored.failureReason).toContain("MANUAL_APPROVAL:");
    expect((await soldUnitsByProduct([product.id])).get(product.id)).toBe(1);
    const other = await fixture(method);
    await expect(approveOrderPaymentManually({ orderId: other.order.id, adminEmail: "operator@example.test", manualCryptoApproval })).rejects.toMatchObject({ code: "manual_approval_reference_used" });
    expect(await prisma.telegramNotification.count({ where: { orderId: other.order.id } })).toBe(0);
    await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
    expect((await soldUnitsByProduct([product.id])).get(product.id) ?? 0).toBe(0);
  });

  it("prevents concurrent manual Binance receipt aliases being used by two invoices", async () => {
    const a = await fixture("BINANCE_INTERNAL"); const b = await fixture("BINANCE_INTERNAL");
    const results = await Promise.allSettled([a, b].map(({ order }, index) => approveOrderPaymentManually({
      orderId: order.id, adminEmail: "operator@example.test", manualCryptoApproval: {
        reference: index ? "M_P_6724974695110983001" : "6724974695110983001", reason: "Manually inspected recipient transaction receipt",
      },
    })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it("rejects expired crypto approval transactionally without reserving a reference or delivering", async () => {
    const { order, attempt } = await fixture("USDT_BEP20");
    await prisma.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(confirmOrderPayment({ orderId: order.id, verifiedBy: "admin:operator", manualCryptoApproval: {
      reference: "0x" + "d".repeat(64), reason: "External receipt inspected manually",
    } })).rejects.toMatchObject({ code: "payment_expired" });
    expect((await prisma.usdtBep20Attempt.findUniqueOrThrow({ where: { id: attempt.id } })).txHash).toBeNull();
    expect(await prisma.telegramNotification.count({ where: { orderId: order.id } })).toBe(0);
  });

  it("deduplicates a USDT hash, verifies exact units, and queues one delivery", async () => {
    const { order, attempt, expectedUsdtMicros } = await fixture("USDT_BEP20");
    const txHash = `0x${"a".repeat(64)}`;
    const rpcClient: BscRpcClient = { request: async <T>(method: string) => ({
      eth_chainId: "0x38", eth_blockNumber: "0x6f",
      eth_getBlockByNumber: { timestamp: `0x${Math.floor(Date.now() / 1000).toString(16)}` },
      eth_getTransactionReceipt: { status: "0x1", blockNumber: "0x64", logs: [{
        address: token, topics: [ERC20_TRANSFER_TOPIC, `0x${"0".repeat(64)}`, `0x${"0".repeat(24)}${recipient.slice(2)}`],
        data: `0x${(expectedUsdtMicros * 10n ** 12n).toString(16).padStart(64, "0")}`, logIndex: "0x0",
      }] },
    })[method as "eth_chainId"] as T };
    await Promise.all(Array.from({ length: 6 }, () => submitUsdtBep20Transaction({
      orderId: order.id, chatId: order.chatId, txHash, rpcClient,
    })));
    expect(await prisma.usdtBep20Attempt.findUniqueOrThrow({ where: { id: attempt.id } }))
      .toMatchObject({ status: "CONFIRMED", confirmations: 12 });
    await expectOneFulfillment(order.id);
    const other = await fixture("USDT_BEP20");
    await expect(submitUsdtBep20Transaction({ orderId: other.order.id, chatId: other.order.chatId, txHash, rpcClient }))
      .rejects.toMatchObject({ code: "TX_HASH_ALREADY_USED" });
  }, 30_000);

  it("preserves immutable recipient snapshots for both providers", async () => {
    const binance = await fixture("BINANCE_INTERNAL");
    const usdt = await fixture("USDT_BEP20");
    await expect(prisma.binanceInternalPaymentAttempt.update({ where: { id: binance.attempt.id },
      data: { recipientBinanceIdSnapshot: "987654321" } })).rejects.toThrow(/immutable/);
    await expect(prisma.usdtBep20Attempt.update({ where: { id: usdt.attempt.id },
      data: { recipientAddressSnapshot: `0x${"3".repeat(40)}` } })).rejects.toThrow(/immutable/);
  });
});
