import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { expirePendingOrders } from "@/server/payment/expire-orders";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function createHealthyStock(productId: string, label: string) {
  return prisma.digitalStockItem.create({
    data: {
      productId,
      originalFilename: `${label}.json`,
      credentialFingerprint: `integration-${label}-${randomUUID()}`,
      encryptedPayload: "integration-encrypted",
      encryptionIv: "integration-iv",
      encryptionTag: "integration-tag",
      status: "AVAILABLE",
      healthStatus: "HEALTHY",
    },
  });
}

databaseDescribe("preorder PostgreSQL concurrency", () => {
  afterAll(async () => {
    if (productIds.length === 0) return;
    const orders = await prisma.order.findMany({
      where: { items: { some: { productId: { in: productIds } } } },
      select: { id: true },
    });
    const orderIds = orders.map((order) => order.id);
    await prisma.telegramNotification.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.sentDelivery.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentEvent.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.bridgePaymentClaim.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.qrisInvoiceAttempt.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.digitalStockItem.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  it(
    "caps concurrent checkout, allocates FIFO once, and fully releases expired stock",
    async () => {
      const preorderProduct = await prisma.product.create({
        data: {
          slug: `integration-preorder-${randomUUID()}`,
          name: "Integration preorder",
          description: "Temporary integration product",
          price: 71_000,
          preorderEnabled: true,
          preorderEtaText: "1-3 hari",
          preorderLimit: 2,
        },
      });
      productIds.push(preorderProduct.id);

      const checkoutResults = await Promise.allSettled(
        ["buyer-a", "buyer-b", "buyer-c"].map((buyer) =>
          createDigitalOrder({
            chatId: buyer,
            buyerUsername: buyer,
            buyerDisplayName: `Telegram ${buyer}`,
            productId: preorderProduct.id,
            idempotencyKey: `integration-${buyer}-${randomUUID()}`,
          }),
        ),
      );
      const accepted = checkoutResults.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const rejected = checkoutResults.flatMap((result) =>
        result.status === "rejected" ? [result.reason] : [],
      );
      expect(accepted).toHaveLength(2);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0])).toContain("Slot preorder sedang penuh");
      expect(accepted.every((order) => order.buyerEmail === null)).toBe(true);
      expect(accepted.every((order) => order.buyerUsername?.startsWith("buyer-"))).toBe(
        true,
      );

      const firstPaid = await confirmOrderPayment({
        orderId: accepted[0].id,
        verifiedBy: "integration-test",
      });
      await delay(15);
      const secondPaid = await confirmOrderPayment({
        orderId: accepted[1].id,
        verifiedBy: "integration-test",
      });
      expect(firstPaid.status).toBe("PAID_WAITING_STOCK");
      expect(secondPaid.status).toBe("PAID_WAITING_STOCK");

      const stockOne = await createHealthyStock(preorderProduct.id, "fifo-one");
      await delay(15);
      const stockTwo = await createHealthyStock(preorderProduct.id, "fifo-two");
      expect(await allocatePaidPreorders(preorderProduct.id, 2)).toBe(2);

      const allocatedOrders = await prisma.order.findMany({
        where: { id: { in: [firstPaid.id, secondPaid.id] } },
        orderBy: { paidAt: "asc" },
        include: { items: true },
      });
      expect(allocatedOrders.map((order) => order.status)).toEqual([
        "FULFILLING",
        "FULFILLING",
      ]);
      expect(allocatedOrders[0].items[0]?.stockItemId).toBe(stockOne.id);
      expect(allocatedOrders[1].items[0]?.stockItemId).toBe(stockTwo.id);

      await prisma.digitalStockItem.updateMany({
        where: { id: { in: [stockOne.id, stockTwo.id] } },
        data: {
          status: "DELIVERED",
          reservedOrderId: null,
          reservedAt: null,
          deliveredAt: new Date(),
        },
      });
      await prisma.order.updateMany({
        where: { id: { in: [firstPaid.id, secondPaid.id] } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      const thirdOrder = await createDigitalOrder({
        chatId: "buyer-d",
        buyerEmail: "buyer-d@example.com",
        productId: preorderProduct.id,
        idempotencyKey: `integration-buyer-d-${randomUUID()}`,
      });
      await confirmOrderPayment({
        orderId: thirdOrder.id,
        verifiedBy: "integration-test",
      });
      const stockThree = await createHealthyStock(preorderProduct.id, "concurrent-one");
      const concurrentAllocations = await Promise.all([
        allocatePaidPreorders(preorderProduct.id, 1),
        allocatePaidPreorders(preorderProduct.id, 1),
      ]);
      expect(concurrentAllocations.reduce((total, value) => total + value, 0)).toBe(1);

      const thirdItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: thirdOrder.id },
      });
      expect(thirdItem.stockItemId).toBe(stockThree.id);
      expect(
        await prisma.telegramNotification.count({
          where: { orderId: thirdOrder.id, kind: "DIGITAL_FILE" },
        }),
      ).toBe(1);
      await confirmOrderPayment({
        orderId: thirdOrder.id,
        verifiedBy: "integration-test-retry",
      });
      expect(
        await prisma.telegramNotification.count({
          where: { orderId: thirdOrder.id, kind: "DIGITAL_FILE" },
        }),
      ).toBe(1);

      const bulkPreorderProduct = await prisma.product.create({
        data: {
          slug: `integration-bulk-preorder-${randomUUID()}`,
          name: "Integration bulk preorder",
          description: "Temporary bulk preorder product",
          price: 20_000,
          preorderEnabled: true,
          preorderEtaText: "2 hari",
          preorderLimit: 10,
        },
      });
      productIds.push(bulkPreorderProduct.id);
      const bulkOrder = await createDigitalOrder({
        chatId: "buyer-bulk",
        productId: bulkPreorderProduct.id,
        quantity: 3,
        idempotencyKey: `integration-bulk-${randomUUID()}`,
      });
      await confirmOrderPayment({
        orderId: bulkOrder.id,
        verifiedBy: "integration-test",
      });
      await createHealthyStock(bulkPreorderProduct.id, "bulk-one");
      await createHealthyStock(bulkPreorderProduct.id, "bulk-two");
      expect(await allocatePaidPreorders(bulkPreorderProduct.id, 1)).toBe(0);
      expect(
        await prisma.orderItem.count({
          where: { orderId: bulkOrder.id, stockItemId: { not: null } },
        }),
      ).toBe(0);
      await createHealthyStock(bulkPreorderProduct.id, "bulk-three");
      expect(await allocatePaidPreorders(bulkPreorderProduct.id, 1)).toBe(1);
      const allocatedBulkOrder = await prisma.order.findUniqueOrThrow({
        where: { id: bulkOrder.id },
        include: { items: true },
      });
      expect(allocatedBulkOrder.status).toBe("FULFILLING");
      expect(allocatedBulkOrder.items).toHaveLength(3);
      expect(allocatedBulkOrder.items.every((item) => item.stockItemId)).toBe(true);
      expect(
        await prisma.telegramNotification.count({ where: { orderId: bulkOrder.id } }),
      ).toBe(4);

      const regularProduct = await prisma.product.create({
        data: {
          slug: `integration-regular-${randomUUID()}`,
          name: "Integration regular",
          description: "Temporary regular product",
          price: 82_000,
        },
      });
      productIds.push(regularProduct.id);
      const expiringStock = await createHealthyStock(regularProduct.id, "expiring");
      const expiringOrder = await createDigitalOrder({
        chatId: "buyer-expiring",
        buyerEmail: "buyer-expiring@example.com",
        productId: regularProduct.id,
        idempotencyKey: `integration-expiring-${randomUUID()}`,
      });
      await prisma.order.update({
        where: { id: expiringOrder.id },
        data: { expiresAt: new Date("2000-01-01T00:00:00.000Z") },
      });
      expect(await expirePendingOrders(1)).toBe(1);

      const [releasedOrder, releasedItem, releasedStock] = await Promise.all([
        prisma.order.findUniqueOrThrow({ where: { id: expiringOrder.id } }),
        prisma.orderItem.findFirstOrThrow({ where: { orderId: expiringOrder.id } }),
        prisma.digitalStockItem.findUniqueOrThrow({ where: { id: expiringStock.id } }),
      ]);
      expect(releasedOrder.status).toBe("EXPIRED");
      expect(releasedItem.stockItemId).toBeNull();
      expect(releasedStock).toMatchObject({
        status: "AVAILABLE",
        reservedOrderId: null,
        reservedAt: null,
      });
    },
    60_000,
  );
});
