import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const quantity = 598;
let productId: string | null = null;
let orderId: string | null = null;
let chatId: string | null = null;
let preorderProductId: string | null = null;
let preorderOrderId: string | null = null;
let preorderChatId: string | null = null;
let previousMaximum: string | undefined;

databaseDescribe("large digital order PostgreSQL behavior", () => {
  beforeAll(() => {
    previousMaximum = process.env.ORDER_MAX_QUANTITY;
    process.env.ORDER_MAX_QUANTITY = "750";
  });

  beforeEach(() => {
    process.env.ORDER_MAX_QUANTITY = "750";
  });

  afterAll(async () => {
    const orderIds = [orderId, preorderOrderId].filter(
      (value): value is string => Boolean(value),
    );
    const productIds = [productId, preorderProductId].filter(
      (value): value is string => Boolean(value),
    );
    const chatIds = [chatId, preorderChatId].filter(
      (value): value is string => Boolean(value),
    );
    if (orderIds.length > 0) {
      await prisma.telegramNotification.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.walletTransaction.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (productIds.length > 0) {
      await prisma.digitalStockItem.deleteMany({
        where: { productId: { in: productIds } },
      });
      await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    }
    if (chatIds.length > 0) {
      await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    }
    if (previousMaximum === undefined) {
      delete process.env.ORDER_MAX_QUANTITY;
    } else {
      process.env.ORDER_MAX_QUANTITY = previousMaximum;
    }
    await prisma.$disconnect();
  });

  it(
    "creates and idempotently retries an order containing 598 distinct stock items",
    async () => {
      const product = await prisma.product.create({
        data: {
          slug: `large-order-${randomUUID()}`,
          name: "Large order integration product",
          description: "Disposable 598-item integration product",
          price: 1_000,
        },
      });
      productId = product.id;
      await prisma.digitalStockItem.createMany({
        data: Array.from({ length: quantity }, (_, index) => ({
          productId: product.id,
          originalFilename: `account-${index + 1}.json`,
          credentialFingerprint: `large-order-${index}-${randomUUID()}`,
          encryptedPayload: "integration-encrypted",
          encryptionIv: "integration-iv",
          encryptionTag: "integration-tag",
          status: "AVAILABLE" as const,
          healthStatus: "HEALTHY" as const,
        })),
      });

      chatId = `large-order-buyer-${randomUUID()}`;
      await prisma.wallet.create({
        data: { chatId, balance: 1_000_000 },
      });
      const idempotencyKey = `large-order-checkout-${randomUUID()}`;
      const order = await createDigitalOrder({
        chatId,
        productId: product.id,
        idempotencyKey,
        paymentMethod: "WALLET",
        quantity,
      });
      orderId = order.id;

      expect(order.items).toHaveLength(quantity);
      expect(new Set(order.items.map((item) => item.stockItemId)).size).toBe(
        quantity,
      );
      expect(order.subtotal).toBe(598_000);
      expect(order.grandTotal).toBe(598_000);
      expect(order.status).toBe("FULFILLING");
      expect(
        await prisma.digitalStockItem.count({
          where: { productId: product.id, status: "RESERVED" },
        }),
      ).toBe(quantity);
      expect(
        await prisma.telegramNotification.count({ where: { orderId: order.id } }),
      ).toBe(quantity);

      process.env.ORDER_MAX_QUANTITY = "500";
      const retry = await createDigitalOrder({
        chatId,
        productId: product.id,
        idempotencyKey,
        paymentMethod: "WALLET",
        quantity,
      });
      expect(retry.id).toBe(order.id);
      expect(retry.items).toHaveLength(quantity);
      expect(
        await prisma.order.count({ where: { idempotencyKey } }),
      ).toBe(1);
      expect(
        await prisma.telegramNotification.count({ where: { orderId: order.id } }),
      ).toBe(quantity);
      process.env.ORDER_MAX_QUANTITY = "750";
    },
    90_000,
  );

  it(
    "allocates all 598 paid preorder items in one idempotent stock pass",
    async () => {
      const product = await prisma.product.create({
        data: {
          slug: `large-preorder-${randomUUID()}`,
          name: "Large preorder integration product",
          description: "Disposable 598-item preorder integration product",
          price: 1_000,
          preorderEnabled: true,
          preorderEtaText: "Integration test",
          preorderLimit: 750,
        },
      });
      preorderProductId = product.id;
      preorderChatId = `large-preorder-buyer-${randomUUID()}`;
      await prisma.wallet.create({
        data: { chatId: preorderChatId, balance: 1_000_000 },
      });

      const order = await createDigitalOrder({
        chatId: preorderChatId,
        productId: product.id,
        idempotencyKey: `large-preorder-checkout-${randomUUID()}`,
        paymentMethod: "WALLET",
        quantity,
      });
      preorderOrderId = order.id;
      expect(order.status).toBe("PAID_WAITING_STOCK");
      expect(order.items).toHaveLength(quantity);
      expect(order.items.every((item) => item.stockItemId === null)).toBe(true);
      expect(
        await prisma.telegramNotification.count({ where: { orderId: order.id } }),
      ).toBe(0);

      await prisma.digitalStockItem.createMany({
        data: Array.from({ length: quantity }, (_, index) => ({
          productId: product.id,
          originalFilename: `preorder-account-${index + 1}.json`,
          credentialFingerprint: `large-preorder-${index}-${randomUUID()}`,
          encryptedPayload: "integration-encrypted",
          encryptionIv: "integration-iv",
          encryptionTag: "integration-tag",
          status: "AVAILABLE" as const,
          healthStatus: "HEALTHY" as const,
        })),
      });

      expect(await allocatePaidPreorders(product.id, 1)).toBe(1);
      const allocated = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        include: { items: true },
      });
      const assignedIds = allocated.items.map((item) => item.stockItemId);
      expect(allocated.status).toBe("FULFILLING");
      expect(assignedIds.every(Boolean)).toBe(true);
      expect(new Set(assignedIds).size).toBe(quantity);
      expect(
        await prisma.digitalStockItem.count({
          where: {
            productId: product.id,
            status: "RESERVED",
            reservedOrderId: order.id,
          },
        }),
      ).toBe(quantity);
      expect(
        await prisma.telegramNotification.count({
          where: { orderId: order.id, kind: "DIGITAL_FILE" },
        }),
      ).toBe(quantity);

      expect(await allocatePaidPreorders(product.id, 1)).toBe(0);
      expect(
        await prisma.telegramNotification.count({
          where: { orderId: order.id, kind: "DIGITAL_FILE" },
        }),
      ).toBe(quantity);
    },
    120_000,
  );
});
