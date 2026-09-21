import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { createQrisMerchant } from "@/server/payment/qris-merchant-service";
import { qrisCrc16 } from "@/server/payment/qris";
import { enqueueProductRestock } from "@/server/telegram/product-broadcast";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productGroupIds: string[] = [];
const productIds: string[] = [];
const orderIds: string[] = [];
const chatIds: string[] = [];
let qrisMerchantId: string | null = null;

function testQrisPayload() {
  const body = "0002010102115204000053033605802ID5908K12 TEST6007JAKARTA";
  const withCrcHeader = `${body}6304`;
  return `${withCrcHeader}${qrisCrc16(withCrcHeader)}`;
}

databaseDescribe("product price and broadcast PostgreSQL behavior", () => {
  beforeAll(async () => {
    process.env.DIGITAL_STOCK_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const merchant = await createQrisMerchant({
      slug: `product-test-qris-${randomUUID()}`,
      name: "Product DB test QRIS",
      providerKey: "DANA",
      basePayload: testQrisPayload(),
      activateAfterSave: true,
      actor: "integration-test",
    });
    qrisMerchantId = merchant.id;
  });

  afterAll(async () => {
    await prisma.telegramNotification.deleteMany({
      where: {
        OR: [
          { productId: { in: productIds } },
          { orderId: { in: orderIds } },
          { chatId: { in: chatIds } },
        ],
      },
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
    await prisma.digitalStockItem.deleteMany({
      where: { productId: { in: productIds } },
    });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.productGroup.deleteMany({ where: { id: { in: productGroupIds } } });
    await prisma.botSession.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    if (qrisMerchantId) {
      await prisma.qrisMerchant.deleteMany({ where: { id: qrisMerchantId } });
    }
    await prisma.$disconnect();
  });

  it(
    "keeps historical order prices immutable and queues one restock broadcast",
    async () => {
      const productGroup = await prisma.productGroup.create({
        data: {
          slug: `product-group-${randomUUID()}`,
          name: "ChatGPT",
          description: "Temporary integration product group",
        },
      });
      productGroupIds.push(productGroup.id);
      const product = await prisma.product.create({
        data: {
          groupId: productGroup.id,
          slug: `product-edit-${randomUUID()}`,
          name: "Product edit integration",
          variantLabel: "K12 JSON",
          groupSortOrder: 10,
          description: "Temporary integration product",
          price: 8_000,
        },
      });
      productIds.push(product.id);
      await prisma.digitalStockItem.createMany({
        data: ["first", "second"].map((label) => ({
          productId: product.id,
          originalFilename: `${label}.txt`,
          credentialFingerprint: `product-${label}-${randomUUID()}`,
          encryptedPayload: "integration-encrypted",
          encryptionIv: "integration-iv",
          encryptionTag: "integration-tag",
          status: "AVAILABLE" as const,
          healthStatus: "HEALTHY" as const,
        })),
      });

      const buyerChatId = `product-buyer-${randomUUID()}`;
      const subscriberChatId = `product-subscriber-${randomUUID()}`;
      chatIds.push(buyerChatId, subscriberChatId);
      const order = await createDigitalOrder({
        chatId: buyerChatId,
        productId: product.id,
        idempotencyKey: `product-edit-order-${randomUUID()}`,
      });
      orderIds.push(order.id);
      await prisma.product.update({
        where: { id: product.id },
        data: { name: "Product edited", variantLabel: "K12 renamed", price: 12_000 },
      });
      await prisma.productGroup.update({
        where: { id: productGroup.id },
        data: { name: "ChatGPT renamed" },
      });
      const orderItem = await prisma.orderItem.findFirstOrThrow({
        where: { orderId: order.id },
      });
      expect(orderItem).toMatchObject({
        productNameSnapshot: "Product edit integration",
        productGroupIdSnapshot: productGroup.id,
        productGroupNameSnapshot: "ChatGPT",
        variantLabelSnapshot: "K12 JSON",
        unitPrice: 8_000,
      });

      await prisma.botSession.create({
        data: { chatId: subscriberChatId, broadcastEnabled: true },
      });
      expect(
        await enqueueProductRestock({
          productId: product.id,
          addedCount: 1,
          batchId: `batch-${randomUUID()}`,
        }),
      ).toBe(1);
      const notification = await prisma.telegramNotification.findFirstOrThrow({
        where: { productId: product.id, chatId: subscriberChatId },
      });
      expect(notification).toMatchObject({
        kind: "PRODUCT_RESTOCK",
        messageText: "1",
        status: "PENDING",
      });
    },
    30_000,
  );

  it("keeps standalone products compatible and blocks checkout through an inactive group", async () => {
    const group = await prisma.productGroup.create({
      data: {
        slug: `inactive-product-group-${randomUUID()}`,
        name: "Inactive group",
        description: "Temporary inactive integration group",
        status: "INACTIVE",
      },
    });
    productGroupIds.push(group.id);
    const groupedProduct = await prisma.product.create({
      data: {
        groupId: group.id,
        slug: `inactive-group-product-${randomUUID()}`,
        name: "Inactive grouped product",
        variantLabel: "Variant",
        description: "Temporary inactive grouped product",
        price: 5_000,
      },
    });
    productIds.push(groupedProduct.id);
    await expect(
      createDigitalOrder({
        chatId: `inactive-group-buyer-${randomUUID()}`,
        productId: groupedProduct.id,
        idempotencyKey: `inactive-group-order-${randomUUID()}`,
      }),
    ).rejects.toThrow("Product is unavailable");

    const standaloneProduct = await prisma.product.create({
      data: {
        slug: `standalone-product-${randomUUID()}`,
        name: "Standalone product",
        description: "Temporary standalone product",
        price: 5_000,
        preorderEnabled: true,
        preorderEtaText: "1 hari",
      },
    });
    productIds.push(standaloneProduct.id);
    const standaloneChatId = `standalone-buyer-${randomUUID()}`;
    chatIds.push(standaloneChatId);
    const order = await createDigitalOrder({
      chatId: standaloneChatId,
      productId: standaloneProduct.id,
      idempotencyKey: `standalone-order-${randomUUID()}`,
    });
    orderIds.push(order.id);
    expect(order.items[0]).toMatchObject({
      productGroupIdSnapshot: null,
      productGroupNameSnapshot: null,
      variantLabelSnapshot: null,
    });
  }, 30_000);

  it("rejects indistinguishable group names and variant labels", async () => {
    const group = await prisma.productGroup.create({
      data: {
        slug: `duplicate-guard-${randomUUID()}`,
        name: "Duplicate Guard",
        description: "Temporary duplicate guard group",
      },
    });
    productGroupIds.push(group.id);

    await expect(
      prisma.productGroup.create({
        data: {
          slug: `duplicate-guard-copy-${randomUUID()}`,
          name: " duplicate guard ",
          description: "Must be rejected case-insensitively",
        },
      }),
    ).rejects.toThrow();

    const product = await prisma.product.create({
      data: {
        groupId: group.id,
        slug: `duplicate-variant-${randomUUID()}`,
        name: "Duplicate variant primary",
        variantLabel: "Team",
        description: "Temporary duplicate variant",
        price: 10_000,
      },
    });
    productIds.push(product.id);

    await expect(
      prisma.product.create({
        data: {
          groupId: group.id,
          slug: `duplicate-variant-copy-${randomUUID()}`,
          name: "Duplicate variant copy",
          variantLabel: " team ",
          description: "Must be rejected case-insensitively",
          price: 10_000,
        },
      }),
    ).rejects.toThrow();
  });

  it("defaults catalog entities and enforces the migration JSON array bounds", async () => {
    const group = await prisma.productGroup.create({
      data: {
        slug: `description-entity-group-${randomUUID()}`,
        name: `Description Entity Group ${randomUUID()}`,
        description: "Legacy group description",
      },
    });
    productGroupIds.push(group.id);
    const product = await prisma.product.create({
      data: {
        groupId: group.id,
        slug: `description-entity-product-${randomUUID()}`,
        name: "Description entity product",
        variantLabel: "Entity variant",
        description: "Legacy product description",
        price: 10_000,
      },
    });
    productIds.push(product.id);

    const [storedProduct] = await prisma.$queryRaw<Array<{
      descriptionEntities: unknown;
      descriptionEn: string | null;
      descriptionEntitiesEn: unknown;
    }>>`
      SELECT "descriptionEntities", "descriptionEn", "descriptionEntitiesEn"
      FROM "Product"
      WHERE "id" = ${product.id}
    `;
    const [storedGroup] = await prisma.$queryRaw<Array<{
      descriptionEntities: unknown;
      descriptionEn: string | null;
      descriptionEntitiesEn: unknown;
    }>>`
      SELECT "descriptionEntities", "descriptionEn", "descriptionEntitiesEn"
      FROM "ProductGroup"
      WHERE "id" = ${group.id}
    `;
    expect(storedProduct.descriptionEntities).toEqual([]);
    expect(storedGroup.descriptionEntities).toEqual([]);
    expect(storedProduct.descriptionEn).toBeNull();
    expect(storedProduct.descriptionEntitiesEn).toEqual([]);
    expect(storedGroup.descriptionEn).toBeNull();
    expect(storedGroup.descriptionEntitiesEn).toEqual([]);

    await expect(prisma.$executeRaw`
      UPDATE "Product"
      SET "descriptionEntities" = ${JSON.stringify({ type: "bold" })}::jsonb
      WHERE "id" = ${product.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "ProductGroup"
      SET "descriptionEntities" = ${JSON.stringify(Array.from({ length: 101 }, () => ({})))}::jsonb
      WHERE "id" = ${group.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "Product"
      SET "descriptionEntitiesEn" = ${JSON.stringify({ type: "bold" })}::jsonb
      WHERE "id" = ${product.id}
    `).rejects.toThrow();
    await expect(prisma.$executeRaw`
      UPDATE "ProductGroup"
      SET "descriptionEntitiesEn" = ${JSON.stringify(Array.from({ length: 101 }, () => ({})))}::jsonb
      WHERE "id" = ${group.id}
    `).rejects.toThrow();
  });

  it("queues one global notification only after payment claims the last stock", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `product-sold-out-${randomUUID()}`,
        name: "Product sold out integration",
        description: "Temporary sold-out product",
        price: 6_000,
        preorderEnabled: true,
        preorderEtaText: "10 menit",
        preorderLimit: 5,
      },
    });
    productIds.push(product.id);
    await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "last-stock.txt",
        credentialFingerprint: `sold-out-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        healthStatus: "HEALTHY",
      },
    });
    const subscriberChatId = `sold-out-subscriber-${randomUUID()}`;
    const buyerChatId = `sold-out-buyer-${randomUUID()}`;
    chatIds.push(subscriberChatId, buyerChatId);
    await prisma.botSession.create({
      data: { chatId: subscriberChatId, broadcastEnabled: true },
    });
    const idempotencyKey = `sold-out-order-${randomUUID()}`;
    const order = await createDigitalOrder({
      chatId: buyerChatId,
      productId: product.id,
      idempotencyKey,
    });
    orderIds.push(order.id);
    expect(order.items.every((item) => item.stockItemId === null)).toBe(true);
    expect(
      await prisma.telegramNotification.count({
        where: { productId: product.id, kind: "PRODUCT_SOLD_OUT" },
      }),
    ).toBe(0);
    await createDigitalOrder({
      chatId: buyerChatId,
      productId: product.id,
      idempotencyKey,
    });
    await confirmOrderPayment({
      orderId: order.id,
      verifiedBy: "integration-test",
    });

    expect(
      await prisma.telegramNotification.count({
        where: {
          productId: product.id,
          chatId: subscriberChatId,
          kind: "PRODUCT_SOLD_OUT",
        },
      }),
    ).toBe(1);
  }, 30_000);

  it("allocates the final stock to the first payment and refunds the loser", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `last-stock-race-${randomUUID()}`,
        name: "Last stock race",
        description: "Temporary concurrency product",
        price: 7_000,
        preorderEnabled: true,
        preorderEtaText: "10 menit",
        preorderLimit: 5,
      },
    });
    productIds.push(product.id);
    await prisma.digitalStockItem.create({
      data: {
        productId: product.id,
        originalFilename: "one-left.txt",
        credentialFingerprint: `one-left-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE",
        healthStatus: "HEALTHY",
      },
    });

    const buyers = [
      { chatId: `race-a-${randomUUID()}`, key: `race-a-${randomUUID()}` },
      { chatId: `race-b-${randomUUID()}`, key: `race-b-${randomUUID()}` },
    ];
    chatIds.push(...buyers.map((buyer) => buyer.chatId));
    const results = await Promise.allSettled(
      buyers.map((buyer) =>
        createDigitalOrder({
          chatId: buyer.chatId,
          productId: product.id,
          idempotencyKey: buyer.key,
        }),
      ),
    );
    const accepted = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    orderIds.push(...accepted.map((order) => order.id));

    expect(accepted).toHaveLength(2);
    expect(accepted.every((order) => order.items[0]?.stockItemId === null)).toBe(true);
    expect(
      await prisma.digitalStockItem.count({
        where: { productId: product.id, status: "RESERVED" },
      }),
    ).toBe(0);

    const paid = await Promise.all(
      accepted.map((order) =>
        confirmOrderPayment({
          orderId: order.id,
          verifiedBy: "integration-test",
        }),
      ),
    );
    expect(paid.map((order) => order.status).sort()).toEqual([
      "FULFILLING",
      "REFUNDED",
    ]);
    expect(
      await prisma.digitalStockItem.count({
        where: { productId: product.id, status: "RESERVED" },
      }),
    ).toBe(1);
    const refunded = paid.find((order) => order.status === "REFUNDED");
    expect(refunded).toBeDefined();
    expect(
      await prisma.wallet.findUniqueOrThrow({ where: { chatId: refunded!.chatId } }),
    ).toMatchObject({ balance: refunded!.grandTotal });
    expect(
      await prisma.walletTransaction.findFirstOrThrow({
        where: { orderId: refunded!.id },
      }),
    ).toMatchObject({
      type: "STOCK_UNAVAILABLE_REFUND",
      amount: refunded!.grandTotal,
    });
  }, 30_000);
});
