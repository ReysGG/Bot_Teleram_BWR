import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { confirmWalletTopup } from "@/server/wallet/topup";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const orderIds: string[] = [];
const topupIds: string[] = [];
const productIds: string[] = [];
const chatIds: string[] = [];

databaseDescribe("payment confirmation contention", () => {
  afterAll(async () => {
    await prisma.telegramNotification.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
    await prisma.walletTransaction.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
    await prisma.bridgePaymentClaim.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.walletTopup.deleteMany({ where: { id: { in: topupIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it("confirms one order once when callbacks arrive concurrently", async () => {
    const chatId = `contention-order-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `contention-product-${randomUUID()}`,
        name: "Contention test product",
        description: "Temporary test product",
        price: 8_000,
      },
    });
    productIds.push(product.id);
    const stock = await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "contention.json",
        credentialFingerprint: `contention-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        healthStatus: "HEALTHY",
      },
    });
    const order = await prisma.order.create({
      data: {
        id: randomUUID(),
        idempotencyKey: `contention-order-${randomUUID()}`,
        invoiceNumber: `CONT-${randomUUID()}`,
        chatId,
        subtotal: product.price,
        serviceFee: 1,
        grandTotal: product.price + 1,
        expiresAt: new Date(Date.now() + 60_000),
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            unitPrice: product.price,
          },
        },
        payment: {
          create: {
            invoiceNumber: `PAY-${randomUUID()}`,
            method: "DANA_RELAY",
            billedAmount: product.price + 1,
            uniqueCode: 1,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
        bridgeClaim: {
          create: {
            claimId: randomUUID(),
            amount: product.price + 1,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
    orderIds.push(order.id);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        confirmOrderPayment({
          orderId: order.id,
          verifiedBy: `contention-test-${index}`,
        }),
      ),
    );
    expect(results.every((result) => result.paymentStatus === "PAID")).toBe(true);
    await expect(
      prisma.digitalStockItem.findUniqueOrThrow({ where: { id: stock.id } }),
    ).resolves.toMatchObject({ status: "RESERVED", reservedOrderId: order.id });
    await expect(
      prisma.telegramNotification.count({
        where: { orderId: order.id, kind: "PAYMENT_SUCCESS" },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.telegramNotification.count({
        where: { orderId: order.id, kind: "DIGITAL_FILE" },
      }),
    ).resolves.toBe(1);
  }, 30_000);

  it("credits one wallet top up once when callbacks arrive concurrently", async () => {
    const chatId = `contention-topup-${randomUUID()}`;
    chatIds.push(chatId);
    await prisma.wallet.create({ data: { chatId } });
    const topup = await prisma.walletTopup.create({
      data: {
        id: randomUUID(),
        idempotencyKey: `contention-topup-${randomUUID()}`,
        invoiceNumber: `TOP-CONT-${randomUUID()}`,
        chatId,
        baseAmount: 10_000,
        uniqueCode: 1,
        billedAmount: 10_001,
        expiresAt: new Date(Date.now() + 60_000),
        bridgeClaim: {
          create: {
            claimId: randomUUID(),
            amount: 10_001,
            expiresAt: new Date(Date.now() + 60_000),
          },
        },
      },
    });
    topupIds.push(topup.id);

    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        confirmWalletTopup({
          walletTopupId: topup.id,
          verifiedBy: `admin:contention-test-${index}`,
          allowManualTransferOverride: true,
        }),
      ),
    );
    expect(results.every((result) => result.status === "PAID")).toBe(true);
    await expect(
      prisma.wallet.findUniqueOrThrow({ where: { chatId } }),
    ).resolves.toMatchObject({ balance: 10_000 });
    await expect(
      prisma.walletTransaction.count({
        where: { idempotencyKey: `topup-credit:${topup.id}` },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.telegramNotification.count({
        where: { walletTopupId: topup.id, kind: "WALLET_TOPUP_SUCCESS" },
      }),
    ).resolves.toBe(1);
  }, 30_000);
});
