import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { cancelPendingOrder } from "@/server/payment/cancel-order";
import { creditExpiredOrderPaymentToWallet } from "@/server/wallet/expired-order-credit";
import { adjustWalletBalance } from "@/server/wallet/ledger";
import { refundFailedDeliveryToWallet } from "@/server/wallet/refund";
import {
  confirmWalletTopup,
  createWalletTopup,
} from "@/server/wallet/topup";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];
const chatIds: string[] = [];

async function createHealthyStock(productId: string, label: string) {
  return prisma.digitalStockItem.create({
    data: {
      productId,
      originalFilename: `${label}.json`,
      credentialFingerprint: `wallet-integration-${label}-${randomUUID()}`,
      encryptedPayload: "integration-encrypted",
      encryptionIv: "integration-iv",
      encryptionTag: "integration-tag",
      status: "AVAILABLE",
      healthStatus: "HEALTHY",
    },
  });
}

databaseDescribe("wallet PostgreSQL transactions", () => {
  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { chatId: { in: chatIds } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    const topups = await prisma.walletTopup.findMany({
      where: { chatId: { in: chatIds } },
      select: { id: true },
    });
    const topupIds = topups.map((topup) => topup.id);
    await prisma.telegramNotification.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
    await prisma.sentDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentEvent.deleteMany({
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
    await prisma.qrisInvoiceAttempt.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
    await prisma.walletTransaction.deleteMany({
      where: { walletChatId: { in: chatIds } },
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

  it("deduplicates wallet debit/top up and refunds only a definite failed delivery", async () => {
    const chatId = `wallet-test-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `wallet-product-${randomUUID()}`,
        name: "Wallet integration product",
        description: "Temporary wallet integration product",
        price: 8_000,
      },
    });
    productIds.push(product.id);
    const stockOne = await createHealthyStock(product.id, "wallet-delivery-one");
    const stockTwo = await createHealthyStock(product.id, "wallet-delivery-two");

    await adjustWalletBalance({
      chatId,
      amount: 30_000,
      idempotencyKey: `seed:${chatId}`,
      actor: "integration-test",
      note: "Seed balance",
    });
    const checkoutKey = `wallet-order:${randomUUID()}`;
    const order = await createDigitalOrder({
      chatId,
      buyerUsername: "walletbuyer",
      buyerDisplayName: "Wallet Buyer",
      productId: product.id,
      idempotencyKey: checkoutKey,
      paymentMethod: "WALLET",
      quantity: 2,
    });
    expect(order.payment).toMatchObject({ method: "WALLET", status: "PAID" });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(
      14_000,
    );
    await createDigitalOrder({
      chatId,
      productId: product.id,
      idempotencyKey: checkoutKey,
      paymentMethod: "WALLET",
      quantity: 2,
    });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(
      14_000,
    );

    const delivery = await prisma.telegramNotification.findFirstOrThrow({
      where: { orderId: order.id, kind: "DIGITAL_FILE" },
    });
    await prisma.$transaction([
      prisma.telegramNotification.update({
        where: { id: delivery.id },
        data: { status: "FAILED", attempts: 5, lastError: "Telegram rejected file" },
      }),
      prisma.sentDelivery.create({
        data: {
          dedupeKey: delivery.dedupeKey,
          orderId: order.id,
          stockItemId: delivery.stockItemId!,
          chatId,
          status: "FAILED",
          lastError: "Telegram rejected file",
        },
      }),
    ]);
    await refundFailedDeliveryToWallet({
      orderId: order.id,
      notificationId: delivery.id,
      reason: "Telegram rejected file",
    });
    await refundFailedDeliveryToWallet({
      orderId: order.id,
      notificationId: delivery.id,
      reason: "Telegram rejected file",
    });
    const [refundedOrder, refundedStocks, refundedWallet] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.digitalStockItem.findMany({
        where: { id: { in: [stockOne.id, stockTwo.id] } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { chatId } }),
    ]);
    expect(refundedOrder.status).toBe("REFUNDED");
    expect(refundedStocks.map((stock) => stock.status)).toEqual([
      "AVAILABLE",
      "AVAILABLE",
    ]);
    expect(refundedWallet.balance).toBe(30_000);
    expect(
      await prisma.walletTransaction.count({
        where: { idempotencyKey: `delivery-refund:${order.id}` },
      }),
    ).toBe(1);

    const topup = await createWalletTopup({
      chatId,
      amount: 10_000,
      idempotencyKey: `topup:${randomUUID()}`,
    });
    expect(topup.uniqueCode).toBeGreaterThanOrEqual(1);
    expect(topup.uniqueCode).toBeLessThanOrEqual(99);
    expect(topup.billedAmount).toBeLessThanOrEqual(10_099);
    // Exercise a real amount collision: different base prices may safely reuse
    // the same suffix, but identical bases must reserve different active amounts.
    await prisma.product.update({ where: { id: product.id }, data: { price: topup.baseAmount } });
    const danaOrder = await createDigitalOrder({
      chatId,
      productId: product.id,
      idempotencyKey: `dana-order:${randomUUID()}`,
      paymentMethod: "DANA",
    });
    expect(danaOrder.payment?.uniqueCode).not.toBe(topup.uniqueCode);
    expect(danaOrder.payment?.billedAmount).not.toBe(topup.billedAmount);
    await confirmWalletTopup({
      walletTopupId: topup.id,
      verifiedBy: "admin:integration-test",
      allowManualTransferOverride: true,
    });
    await confirmWalletTopup({
      walletTopupId: topup.id,
      verifiedBy: "admin:integration-test-retry",
      allowManualTransferOverride: true,
    });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(
      40_000,
    );
    expect(
      await prisma.walletTransaction.count({
        where: { idempotencyKey: `topup-credit:${topup.id}` },
      }),
    ).toBe(1);
  }, 60_000);

  it("uses wallet balance first, bills only the QRIS remainder, and restores saldo on cancel", async () => {
    const chatId = `mixed-wallet-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `mixed-wallet-product-${randomUUID()}`,
        name: "Mixed wallet product",
        description: "Temporary mixed payment product",
        price: 10_000,
      },
    });
    productIds.push(product.id);
    await createHealthyStock(product.id, "mixed-wallet-stock");
    await adjustWalletBalance({
      chatId,
      amount: 3_200,
      idempotencyKey: `mixed-seed:${chatId}`,
      actor: "integration-test",
    });

    const order = await createDigitalOrder({
      chatId,
      buyerUsername: "mixedbuyer",
      productId: product.id,
      idempotencyKey: `mixed-order:${randomUUID()}`,
      paymentMethod: "WALLET_QRIS",
    });
    expect(order.payment).toMatchObject({
      method: "WALLET_QRIS",
      status: "PENDING",
    });
    expect(order.payment!.billedAmount).toBeGreaterThanOrEqual(6_801);
    expect(order.payment!.billedAmount).toBeLessThanOrEqual(6_899);
    expect(order.grandTotal - order.payment!.billedAmount).toBe(3_200);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(0);

    await cancelPendingOrder({ orderId: order.id, chatId });
    await cancelPendingOrder({ orderId: order.id, chatId });
    expect((await prisma.wallet.findUniqueOrThrow({ where: { chatId } })).balance).toBe(3_200);
    expect(
      await prisma.walletTransaction.count({
        where: { idempotencyKey: `pending-payment-release:${order.id}` },
      }),
    ).toBe(1);
  }, 30_000);

  it("credits an expired external payment once without making the order deliverable", async () => {
    const chatId = `expired-credit-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `expired-credit-product-${randomUUID()}`,
        name: "Expired credit product",
        description: "Temporary expired payment credit product",
        price: 37_000,
      },
    });
    productIds.push(product.id);
    const order = await prisma.order.create({
      data: {
        idempotencyKey: `expired-credit-order:${randomUUID()}`,
        invoiceNumber: `EXPIRED-${randomUUID()}`,
        chatId,
        buyerUsername: "expiredbuyer",
        subtotal: 37_000,
        serviceFee: 21,
        grandTotal: 37_021,
        status: "EXPIRED",
        paymentStatus: "EXPIRED",
        expiresAt: new Date(Date.now() - 60_000),
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
            billedAmount: 37_021,
            uniqueCode: 21,
            status: "EXPIRED",
            expiresAt: new Date(Date.now() - 60_000),
          },
        },
      },
      include: { payment: true },
    });

    const first = await creditExpiredOrderPaymentToWallet({
      orderId: order.id,
      adminEmail: "integration@example.test",
    });
    const retry = await creditExpiredOrderPaymentToWallet({
      orderId: order.id,
      adminEmail: "integration@example.test",
    });
    const [updatedOrder, wallet, creditCount, deliveryCount] = await Promise.all([
      prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { payment: true },
      }),
      prisma.wallet.findUniqueOrThrow({ where: { chatId } }),
      prisma.walletTransaction.count({
        where: { idempotencyKey: `expired-order-payment-credit:${order.id}` },
      }),
      prisma.telegramNotification.count({
        where: { orderId: order.id, kind: "DIGITAL_FILE" },
      }),
    ]);

    expect(first.credited).toBe(true);
    expect(retry.credited).toBe(false);
    expect(wallet.balance).toBe(37_000);
    expect(creditCount).toBe(1);
    expect(updatedOrder).toMatchObject({ status: "EXPIRED", paymentStatus: "PAID" });
    expect(updatedOrder.payment?.status).toBe("PAID");
    expect(deliveryCount).toBe(0);
  }, 30_000);

  it("rejects expired wallet credit when a digital delivery was already queued", async () => {
    const chatId = `expired-credit-delivery-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `expired-credit-delivery-product-${randomUUID()}`,
        name: "Expired credit delivery guard product",
        description: "Temporary expired payment delivery guard product",
        price: 37_000,
      },
    });
    productIds.push(product.id);
    const order = await prisma.order.create({
      data: {
        idempotencyKey: `expired-credit-delivery-order:${randomUUID()}`,
        invoiceNumber: `EXPIRED-DELIVERY-${randomUUID()}`,
        chatId,
        subtotal: 37_000,
        serviceFee: 21,
        grandTotal: 37_021,
        status: "EXPIRED",
        paymentStatus: "EXPIRED",
        expiresAt: new Date(Date.now() - 60_000),
        items: {
          create: {
            productId: product.id,
            productNameSnapshot: product.name,
            unitPrice: product.price,
          },
        },
        payment: {
          create: {
            invoiceNumber: `PAY-DELIVERY-${randomUUID()}`,
            method: "DANA_RELAY",
            billedAmount: 37_021,
            uniqueCode: 21,
            status: "EXPIRED",
            expiresAt: new Date(Date.now() - 60_000),
          },
        },
      },
    });
    await prisma.telegramNotification.create({
      data: {
        dedupeKey: `digital-delivery-guard:${order.id}`,
        chatId,
        orderId: order.id,
        kind: "DIGITAL_FILE",
      },
    });

    await expect(
      creditExpiredOrderPaymentToWallet({
        orderId: order.id,
        adminEmail: "integration@example.test",
      }),
    ).rejects.toThrow("Order pernah masuk proses pengiriman");

    expect(await prisma.wallet.findUnique({ where: { chatId } })).toBeNull();
    expect(
      await prisma.walletTransaction.count({
        where: { idempotencyKey: `expired-order-payment-credit:${order.id}` },
      }),
    ).toBe(0);
  }, 30_000);
});
