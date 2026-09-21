import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { cancelPaidPreorder } from "@/server/preorder/cancel";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];
const chatIds: string[] = [];

databaseDescribe("paid preorder cancellation", () => {
  afterAll(async () => {
    const orders = await prisma.order.findMany({
      where: { chatId: { in: chatIds } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    await prisma.telegramNotification.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.sentDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentEvent.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.bridgePaymentClaim.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.qrisInvoiceAttempt.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    await prisma.walletTransaction.deleteMany({
      where: { walletChatId: { in: chatIds } },
    });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it("returns the full paid amount to wallet exactly once before stock allocation", async () => {
    const chatId = `cancel-preorder-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `cancel-preorder-${randomUUID()}`,
        name: "Cancelable preorder",
        description: "Temporary integration product",
        price: 12_000,
        preorderEnabled: true,
        preorderEtaText: "2 hari",
        preorderLimit: 5,
      },
    });
    productIds.push(product.id);
    const order = await createDigitalOrder({
      chatId,
      buyerUsername: "cancelbuyer",
      productId: product.id,
      idempotencyKey: `cancel-order-${randomUUID()}`,
    });
    const paid = await confirmOrderPayment({
      orderId: order.id,
      verifiedBy: "integration-test",
    });
    expect(paid.status).toBe("PAID_WAITING_STOCK");

    const first = await cancelPaidPreorder({
      orderId: order.id,
      actor: "admin:integration-test",
      reason: "Stok tidak dapat dipenuhi sesuai estimasi",
    });
    const second = await cancelPaidPreorder({
      orderId: order.id,
      actor: "admin:integration-test",
      reason: "Retry idempotent",
    });
    expect(first.transaction.id).toBe(second.transaction.id);

    const [refundedOrder, wallet, transactions, notifications] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.wallet.findUniqueOrThrow({ where: { chatId } }),
      prisma.walletTransaction.findMany({ where: { orderId: order.id } }),
      prisma.telegramNotification.findMany({ where: { orderId: order.id } }),
    ]);
    expect(refundedOrder.status).toBe("REFUNDED");
    expect(wallet.balance).toBe(order.grandTotal);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      type: "PREORDER_CANCEL_REFUND",
      amount: order.grandTotal,
    });
    expect(
      notifications.filter((notification) => notification.kind === "PREORDER_CANCELLED"),
    ).toHaveLength(1);

    await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "cancelled-preorder-stock.json",
        credentialFingerprint: `cancelled-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        healthStatus: "HEALTHY",
      },
    });
    expect(await allocatePaidPreorders(product.id, 1)).toBe(0);
  }, 60_000);

  it("blocks cancel and refund after any stock has been allocated", async () => {
    const chatId = `locked-preorder-${randomUUID()}`;
    chatIds.push(chatId);
    const product = await prisma.product.create({
      data: {
        slug: `locked-preorder-${randomUUID()}`,
        name: "Allocated preorder",
        description: "Temporary allocated preorder",
        price: 9_000,
        preorderEnabled: true,
        preorderEtaText: "10 menit",
        preorderLimit: 5,
      },
    });
    productIds.push(product.id);
    const order = await createDigitalOrder({
      chatId,
      productId: product.id,
      idempotencyKey: `locked-order-${randomUUID()}`,
    });
    await confirmOrderPayment({
      orderId: order.id,
      verifiedBy: "integration-test",
    });
    await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "allocated.json",
        credentialFingerprint: `allocated-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        healthStatus: "HEALTHY",
      },
    });
    expect(await allocatePaidPreorders(product.id, 1)).toBe(1);

    await expect(
      cancelPaidPreorder({
        orderId: order.id,
        actor: "admin:integration-test",
        reason: "Stale admin page must not refund",
      }),
    ).rejects.toThrow("masih menunggu stok");
    expect(
      await prisma.walletTransaction.count({ where: { orderId: order.id } }),
    ).toBe(0);
  }, 60_000);
});
