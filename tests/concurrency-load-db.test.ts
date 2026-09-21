import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { digitalDeliveryDedupeKey } from "@/server/telegram/delivery-key";
import { claimTelegramUpdate } from "@/server/telegram/update-store";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const runId = randomUUID();
const chatPrefix = `load-${runId}`;
const productIds: string[] = [];
const orderIds: string[] = [];
const updateIds: bigint[] = [];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Timed out after ${milliseconds}ms`)),
          milliseconds,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function createProductWithStock(stockCount: number) {
  const product = await prisma.product.create({
    data: {
      slug: `load-${runId}-${productIds.length}`,
      name: `Load test ${productIds.length}`,
      description: "Temporary non-production concurrency fixture",
      price: 8_000,
    },
  });
  productIds.push(product.id);
  await prisma.digitalStockItem.createMany({
    data: Array.from({ length: stockCount }, (_, index) => ({
      productId: product.id,
      originalFilename: `load-${index}.txt`,
      credentialFingerprint: `load-${runId}-${product.id}-${index}`,
      encryptedPayload: "integration-encrypted",
      encryptionIv: "integration-iv",
      encryptionTag: "integration-tag",
      status: "AVAILABLE" as const,
      healthStatus: "HEALTHY" as const,
    })),
  });
  return product;
}

databaseDescribe("PostgreSQL concurrency load", () => {
  afterAll(async () => {
    const discoveredOrders = await prisma.order.findMany({
      where: {
        OR: [
          { id: { in: orderIds } },
          { chatId: { startsWith: chatPrefix } },
          { items: { some: { productId: { in: productIds } } } },
        ],
      },
      select: { id: true },
    });
    const cleanupOrderIds = [...new Set(discoveredOrders.map((order) => order.id))];
    await prisma.telegramNotification.deleteMany({
      where: {
        OR: [
          { orderId: { in: cleanupOrderIds } },
          { chatId: { startsWith: chatPrefix } },
        ],
      },
    });
    await prisma.sentDelivery.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.bridgePaymentEvent.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.bridgePaymentClaim.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.qrisInvoiceAttempt.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.walletTransaction.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.payment.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.orderItem.deleteMany({
      where: { orderId: { in: cleanupOrderIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: cleanupOrderIds } } });
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.telegramProcessedUpdate.deleteMany({
      where: { updateId: { in: updateIds } },
    });
    await prisma.$disconnect();
  });

  it("lets different products lock concurrently but serializes the same product", async () => {
    const firstLocked = deferred();
    const releaseFirst = deferred();
    const secondLocked = deferred();

    const first = prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, `same-${runId}`);
      firstLocked.resolve();
      await releaseFirst.promise;
    });
    await withTimeout(firstLocked.promise, 2_000);
    const second = prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, `same-${runId}`);
      secondLocked.resolve();
    });
    await expect(
      withTimeout(secondLocked.promise, 150),
    ).rejects.toThrow("Timed out");
    releaseFirst.resolve();
    await withTimeout(Promise.all([first, second]), 3_000);

    const differentFirstLocked = deferred();
    const releaseDifferentFirst = deferred();
    const differentSecondLocked = deferred();
    const differentFirst = prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, `different-a-${runId}`);
      differentFirstLocked.resolve();
      await releaseDifferentFirst.promise;
    });
    await withTimeout(differentFirstLocked.promise, 2_000);
    const differentSecond = prisma.$transaction(async (tx) => {
      await lockInventoryAllocation(tx, `different-b-${runId}`);
      differentSecondLocked.resolve();
    });
    await withTimeout(differentSecondLocked.promise, 1_000);
    releaseDifferentFirst.resolve();
    await withTimeout(Promise.all([differentFirst, differentSecond]), 3_000);
  });

  it("claims one Telegram update once under a 100-request burst", async () => {
    const updateId = BigInt(Date.now()) * 1_000n + BigInt(Math.floor(Math.random() * 999));
    updateIds.push(updateId);
    const claims = await Promise.all(
      Array.from({ length: 100 }, () =>
        claimTelegramUpdate({
          updateId: Number(updateId),
          chatId: `${chatPrefix}-telegram-update`,
        }),
      ),
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.filter((claimed) => !claimed)).toHaveLength(99);
    expect(
      await prisma.telegramProcessedUpdate.count({ where: { updateId } }),
    ).toBe(1);
  }, 30_000);

  it("creates and confirms one order once under 100 duplicate operations", async () => {
    const product = await createProductWithStock(1);
    const chatId = `${chatPrefix}-buyer`;
    const idempotencyKey = `load-checkout-${runId}`;

    const checkoutResults = await Promise.all(
      Array.from({ length: 50 }, () =>
        createDigitalOrder({
          chatId,
          productId: product.id,
          idempotencyKey,
        }),
      ),
    );
    const uniqueOrderIds = new Set(checkoutResults.map((order) => order.id));
    expect(uniqueOrderIds.size).toBe(1);
    const orderId = checkoutResults[0].id;
    orderIds.push(orderId);

    const confirmations = await Promise.all(
      Array.from({ length: 50 }, () =>
        confirmOrderPayment({
          orderId,
          verifiedBy: "concurrency-load-test",
        }),
      ),
    );
    expect(confirmations.every((order) => order.status === "FULFILLING")).toBe(true);
    expect(
      await prisma.payment.count({ where: { orderId, status: "PAID" } }),
    ).toBe(1);
    expect(
      await prisma.telegramNotification.count({
        where: { orderId, kind: "PAYMENT_SUCCESS" },
      }),
    ).toBe(1);
    expect(
      await prisma.telegramNotification.count({
        where: { orderId, kind: "DIGITAL_FILE" },
      }),
    ).toBe(1);

    const stock = await prisma.digitalStockItem.findFirstOrThrow({
      where: { productId: product.id, reservedOrderId: orderId },
    });
    const dedupeKey = digitalDeliveryDedupeKey(orderId, stock.id);
    const deliveryAttempts = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        prisma.sentDelivery.create({
          data: { dedupeKey, orderId, stockItemId: stock.id, chatId },
        }),
      ),
    );
    expect(
      deliveryAttempts.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      await prisma.sentDelivery.count({ where: { orderId, stockItemId: stock.id } }),
    ).toBe(1);
  }, 120_000);
});
