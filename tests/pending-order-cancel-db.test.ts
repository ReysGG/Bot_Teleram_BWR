import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import { cancelPendingOrder } from "@/server/payment/cancel-order";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const productIds: string[] = [];
const orderIds: string[] = [];

databaseDescribe("pending invoice abuse protection", () => {
  afterAll(async () => {
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

  it("allows another Telegram invoice while preserving owner-only cancellation and stock reservations", async () => {
    const product = await prisma.product.create({
      data: {
        slug: `pending-cancel-${randomUUID()}`,
        name: "Pending cancel integration",
        description: "Temporary integration product",
        price: 9_000,
      },
    });
    productIds.push(product.id);
    await prisma.digitalStockItem.createMany({
      data: ["one", "two"].map((label) => ({
        productId: product.id,
        originalFilename: `${label}.json`,
        credentialFingerprint: `pending-cancel-${label}-${randomUUID()}`,
        encryptedPayload: "integration-encrypted",
        encryptionIv: "integration-iv",
        encryptionTag: "integration-tag",
        status: "AVAILABLE" as const,
        healthStatus: "HEALTHY" as const,
      })),
    });

    const chatId = `pending-cancel-buyer-${randomUUID()}`;
    const first = await createDigitalOrder({
      chatId,
      productId: product.id,
      idempotencyKey: `pending-first-${randomUUID()}`,
    });
    orderIds.push(first.id);

    const second = await createDigitalOrder({
      chatId, productId: product.id, idempotencyKey: `pending-second-${randomUUID()}`,
    });
    orderIds.push(second.id);
    expect(second.id).not.toBe(first.id);
    expect(second.items[0].stockItemId).toBeNull();
    expect(first.items[0].stockItemId).toBeNull();
    expect(second.payment?.billedAmount).not.toBe(first.payment?.billedAmount);
    await expect(
      cancelPendingOrder({ orderId: first.id, chatId: "different-chat" }),
    ).rejects.toThrow("Order tidak ditemukan");

    const cancelled = await cancelPendingOrder({ orderId: first.id, chatId });
    const cancelledRetry = await cancelPendingOrder({ orderId: first.id, chatId });
    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelledRetry.status).toBe("CANCELLED");
    expect(cancelled.payment?.status).toBe("EXPIRED");
    expect(
      await prisma.bridgePaymentClaim.findUniqueOrThrow({ where: { orderId: first.id } }),
    ).toMatchObject({ status: "CANCELLED" });
    await expect(
      confirmOrderPayment({ orderId: first.id, verifiedBy: "integration-test" }),
    ).rejects.toThrow("Order is not awaiting payment");

    const replacement = await createDigitalOrder({
      chatId,
      productId: product.id,
      idempotencyKey: `pending-replacement-${randomUUID()}`,
    });
    orderIds.push(replacement.id);
    expect(replacement.status).toBe("PENDING_PAYMENT");
    expect(await prisma.order.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ status: "PENDING_PAYMENT", paymentStatus: "PENDING" });
  }, 30_000);
  it("caps simultaneous cross-product Telegram invoices at five and replays existing keys", async () => {
    const products = await Promise.all([0, 1].map(async index => {
      const product = await prisma.product.create({ data: { slug:`pending-limit-${randomUUID()}`, name:`Pending limit ${index}`, description:"Disposable", price:9000 } });
      productIds.push(product.id);
      await prisma.digitalStockItem.createMany({ data:Array.from({length:4}, (_,unit) => ({ productId:product.id, originalFilename:`unit-${unit}.txt`, credentialFingerprint:randomUUID(), encryptedPayload:"test", encryptionIv:"test", encryptionTag:"test", status:"AVAILABLE", healthStatus:"HEALTHY" })) });
      return product;
    }));
    const chatId = `pending-limit-buyer-${randomUUID()}`;
    const inputs = Array.from({length:6}, (_,i) => ({ chatId, productId:products[i%2].id, idempotencyKey:`pending-limit-${randomUUID()}` }));
    const results = await Promise.allSettled(inputs.map(input => createDigitalOrder(input)));
    const successes = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
    orderIds.push(...successes.map(order => order.id));
    expect(successes).toHaveLength(5);
    const failure = results.find(result => result.status === "rejected");
    expect(failure?.status === "rejected" && failure.reason.code).toBe("ACTIVE_INVOICE_LIMIT");
    expect(successes.every(order => order.items.every(item => item.stockItemId === null))).toBe(true);
    expect(new Set(successes.map(order => order.payment?.billedAmount)).size).toBe(5);
    const replayIndex = results.findIndex(result => result.status === "fulfilled");
    expect((await createDigitalOrder(inputs[replayIndex])).id).toBe(successes[0].id);
    await cancelPendingOrder({orderId:successes[0].id,chatId});
    const replacement = await createDigitalOrder({...inputs[replayIndex],idempotencyKey:`replacement-${randomUUID()}`});
    orderIds.push(replacement.id);
    expect(await prisma.order.count({where:{chatId,status:"PENDING_PAYMENT"}})).toBe(5);
    const toPay = [...successes.slice(1),replacement];
    await Promise.all(toPay.map(order => confirmOrderPayment({orderId:order.id,verifiedBy:"integration-test"})));
    const paidItems = await prisma.orderItem.findMany({where:{orderId:{in:toPay.map(order=>order.id)}},select:{stockItemId:true}});
    expect(paidItems).toHaveLength(5);
    expect(paidItems.every(item=>Boolean(item.stockItemId))).toBe(true);
    expect(new Set(paidItems.map(item=>item.stockItemId)).size).toBe(5);
  }, 60_000);

});
