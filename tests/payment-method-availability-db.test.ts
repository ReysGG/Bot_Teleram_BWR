import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { prisma } from "@/server/db/prisma";
import {
  getPaymentMethodAvailability,
  setPaymentMethodAvailability,
} from "@/server/payment/method-availability";
import { createWalletTopup } from "@/server/wallet/topup";

// This suite changes the global payment toggle briefly, so it requires an
// explicit isolated test-database opt-in instead of the general DB test flag.
const databaseDescribe =
  process.env.RUN_PAYMENT_AVAILABILITY_DB_TESTS === "1"
    ? describe.sequential
    : describe.skip;

databaseDescribe("payment method availability PostgreSQL guards", () => {
  const chatId = `payment-availability-${randomUUID()}`;
  const productId = randomUUID();
  let settingExisted = false;
  let originalSetting: Awaited<ReturnType<typeof getPaymentMethodAvailability>>;
  let originalAudit: {
    paymentMethodsUpdatedAt: Date | null;
    paymentMethodsUpdatedBy: string | null;
    usdtBep20UpdatedAt: Date | null;
    usdtBep20UpdatedBy: string | null;
    binanceInternalUpdatedAt: Date | null;
    binanceInternalUpdatedBy: string | null;
    jagoTransferUpdatedAt: Date | null;
    jagoTransferUpdatedBy: string | null;
  } | null = null;

  beforeAll(async () => {
    originalAudit = await prisma.storeRuntimeSetting.findUnique({
      where: { id: "global" },
      select: {
        paymentMethodsUpdatedAt: true,
        paymentMethodsUpdatedBy: true,
        usdtBep20UpdatedAt: true,
        usdtBep20UpdatedBy: true,
        binanceInternalUpdatedAt: true,
        binanceInternalUpdatedBy: true,
        jagoTransferUpdatedAt: true,
        jagoTransferUpdatedBy: true,
      },
    });
    settingExisted = originalAudit !== null;
    originalSetting = await getPaymentMethodAvailability();

    await setPaymentMethodAvailability({
      qrisDanaEnabled: true,
      walletCheckoutEnabled: originalSetting.walletCheckoutEnabled,
      mixedWalletQrisEnabled: originalSetting.mixedWalletQrisEnabled,
      walletTopupEnabled: true,
      usdtBep20Enabled: originalSetting.usdtBep20Enabled,
      binanceInternalEnabled: originalSetting.binanceInternalEnabled,
      jagoTransferEnabled: originalSetting.jagoTransferEnabled,
      actor: "integration-test:payment-availability",
    });

    await prisma.product.create({
      data: {
        id: productId,
        slug: `payment-availability-${randomUUID()}`,
        name: "Payment availability integration product",
        description: "Temporary integration-test product",
        price: 8_000,
        stockItems: {
          create: {
            originalFilename: "payment-availability.json",
            credentialFingerprint: `payment-availability-${randomUUID()}`,
            encryptedPayload: "integration-encrypted",
            encryptionIv: "integration-iv",
            encryptionTag: "integration-tag",
            status: "AVAILABLE",
            healthStatus: "HEALTHY",
          },
        },
      },
    });
  });

  afterAll(async () => {
    const [orders, topups] = await Promise.all([
      prisma.order.findMany({
        where: { chatId },
        select: { id: true },
      }),
      prisma.walletTopup.findMany({
        where: { chatId },
        select: { id: true },
      }),
    ]);
    const orderIds = orders.map(({ id }) => id);
    const topupIds = topups.map(({ id }) => id);

    await prisma.telegramNotification.deleteMany({
      where: {
        OR: [
          { orderId: { in: orderIds } },
          { walletTopupId: { in: topupIds } },
        ],
      },
    });
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
    await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.walletTopup.deleteMany({ where: { id: { in: topupIds } } });
    await prisma.wallet.deleteMany({ where: { chatId } });
    await prisma.digitalStockItem.deleteMany({ where: { productId } });
    await prisma.product.deleteMany({ where: { id: productId } });

    if (settingExisted && originalAudit) {
      await setPaymentMethodAvailability({
        qrisDanaEnabled: originalSetting.qrisDanaEnabled,
        walletCheckoutEnabled: originalSetting.walletCheckoutEnabled,
        mixedWalletQrisEnabled: originalSetting.mixedWalletQrisEnabled,
        walletTopupEnabled: originalSetting.walletTopupEnabled,
        usdtBep20Enabled: originalSetting.usdtBep20Enabled,
        binanceInternalEnabled: originalSetting.binanceInternalEnabled,
        jagoTransferEnabled: originalSetting.jagoTransferEnabled,
        actor: originalSetting.updatedBy ?? "integration-test:restore",
      });
      await prisma.storeRuntimeSetting.update({
        where: { id: "global" },
        data: {
          ...originalAudit,
        },
      });
    } else {
      await prisma.storeRuntimeSetting.deleteMany({ where: { id: "global" } });
    }
  });

  it("rejects new QRIS orders but returns an existing idempotent invoice", async () => {
    const idempotencyKey = `payment-availability-order-${randomUUID()}`;
    const existing = await createDigitalOrder({
      chatId,
      productId,
      idempotencyKey,
      paymentMethod: "DANA",
    });

    const current = await getPaymentMethodAvailability();
    await setPaymentMethodAvailability({
      ...current,
      qrisDanaEnabled: false,
      mixedWalletQrisEnabled: false,
      walletTopupEnabled: false,
      actor: "integration-test:disable-qris",
    });

    await expect(
      createDigitalOrder({
        chatId: `${chatId}-new-order`,
        productId,
        idempotencyKey: `payment-availability-order-${randomUUID()}`,
        paymentMethod: "DANA",
      }),
    ).rejects.toThrow("Pembayaran QRIS/DANA sedang dinonaktifkan admin.");
    await expect(
      createDigitalOrder({
        chatId,
        productId,
        idempotencyKey,
        paymentMethod: "DANA",
      }),
    ).resolves.toMatchObject({ id: existing.id });
  }, 30_000);

  it("rejects new wallet top-ups but returns an existing idempotent top-up", async () => {
    const current = await getPaymentMethodAvailability();
    await setPaymentMethodAvailability({
      ...current,
      qrisDanaEnabled: true,
      walletTopupEnabled: true,
      actor: "integration-test:enable-topup",
    });
    const idempotencyKey = `payment-availability-topup-${randomUUID()}`;
    const existing = await createWalletTopup({
      chatId,
      amount: 10_000,
      idempotencyKey,
    });

    await setPaymentMethodAvailability({
      ...(await getPaymentMethodAvailability()),
      walletTopupEnabled: false,
      actor: "integration-test:disable-topup",
    });

    await expect(
      createWalletTopup({
        chatId: `${chatId}-new-topup`,
        amount: 10_000,
        idempotencyKey: `payment-availability-topup-${randomUUID()}`,
      }),
    ).rejects.toThrow("Top up wallet sedang dinonaktifkan admin.");
    await expect(
      createWalletTopup({ chatId, amount: 10_000, idempotencyKey }),
    ).resolves.toMatchObject({ id: existing.id });
  }, 30_000);
});
