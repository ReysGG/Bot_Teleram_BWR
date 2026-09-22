import { randomUUID } from "node:crypto";
import type { OrderChannel } from "@/generated/prisma/client";
import { booleanEnv, integerEnv } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { runIdempotentTransactionWithRetry } from "@/server/db/transaction-retry";
import { registerPaymentClaim } from "@/server/payment/relay-client";
import { allocateUniqueCode } from "@/server/checkout/payment-amount";
import { UNIQUE_CODE_MAX } from "@/server/checkout/amount";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { checkoutPaymentExpiryMinutes } from "@/server/payment/checkout-expiry";
import { ActiveInvoiceError, ActiveInvoiceLimitError } from "@/server/checkout/errors";
import {
  paidOrderStatus,
  resolveCheckoutAvailability,
} from "@/server/preorder/policy";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { queueOrderDigitalDelivery } from "@/server/orders/delivery-channel";
import { webCustomerChatId } from "@/server/storefront/customer-access";
import { enqueueProductSoldOut } from "@/server/telegram/product-broadcast";
import { cleanError } from "@/server/utils/format";
import { assertStoreOrderingAvailable } from "@/server/store/maintenance";
import { sellableStockWhere } from "@/server/stock/sellable";
import { idrToUsdtMicros } from "@/server/payment/usdt-amount";
import { normalizeEvmAddress } from "@/server/payment/usdt-bep20-setting";
import {
  allocateUsdtBep20UniqueMicros,
  usdtMicrosToTokenUnits,
} from "@/server/payment/usdt-bep20-amount";
import {
  getBinanceInternalSetting,
  normalizeBinanceRecipientId,
} from "@/server/payment/binance-internal-setting";
import { allocateBinanceInternalUniqueMicros } from "@/server/payment/binance-internal-amount";
import { getUsdtRateSetting } from "@/server/payment/usdt-rate-setting";
import { isDanaBridgeOrderPaymentMethod } from "@/server/payment/dana-payment-method";
import {
  getJagoTransferSetting,
  normalizeJagoAccountNumber,
} from "@/server/payment/jago-transfer-setting";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import {
  assertCheckoutPaymentMethodEnabled,
  getPaymentMethodAvailability,
  type CheckoutPaymentMethod,
} from "@/server/payment/method-availability";
import {
  assertQrisEvidenceIdempotency,
  createQrisInvoiceAttempt,
  type QrisInvoiceEvidenceMode,
} from "@/server/payment/qris-merchant-service";
import { qrisProviderUsesDanaRelay } from "@/server/payment/qris-provider-registry";
import {
  assertOrderQuantityWithinCapacity,
  getMaxOrderQuantity,
  HARD_MAX_ORDER_QUANTITY,
  normalizeOrderQuantity,
  resolveOrderQuantityCapacity,
} from "@/server/checkout/order-quantity";
import {
  assertOrderTotalCapacity,
  assertStoredOrderAmount,
  calculateOrderSubtotal,
  maxOrderQuantityForUnitPrice,
} from "@/server/checkout/order-amount";

export {
  DEFAULT_MAX_ORDER_QUANTITY,
  HARD_MAX_ORDER_QUANTITY,
  getMaxOrderQuantity,
  normalizeOrderQuantity,
  resolveOrderQuantityCapacity,
} from "@/server/checkout/order-quantity";

async function queueSoldOutBroadcast(order: {
  id: string;
  items: Array<{ productId: string; stockItemId: string | null }>;
}) {
  const productId = order.items.find((item) => item.stockItemId)?.productId;
  if (!productId) return;
  try {
    await enqueueProductSoldOut({ productId, orderId: order.id });
  } catch (error) {
    console.warn("[Product sold-out notification]", cleanError(error));
  }
}

function invoiceNumber(): string {
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `TGS-${day}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createDigitalOrder(input: {
  chatId: string;
  channel?: OrderChannel;
  webCustomerId?: string | null;
  buyerEmail?: string | null;
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
  productId: string;
  idempotencyKey: string;
  paymentMethod?: CheckoutPaymentMethod;
  quantity?: number;
  qrisEvidenceMode?: QrisInvoiceEvidenceMode;
  shopeeSessionId?: string | null;
}) {
  const channel = input.channel ?? "TELEGRAM";
  if (
    (channel === "WEB" &&
      (!input.webCustomerId || input.chatId !== webCustomerChatId(input.webCustomerId))) ||
    (channel === "TELEGRAM" && input.webCustomerId)
  ) {
    throw new Error("Order channel owner is invalid");
  }
  const requestedPaymentMethod = input.paymentMethod ?? "DANA";
  if (
    (input.qrisEvidenceMode || input.shopeeSessionId) &&
    requestedPaymentMethod !== "DANA" &&
    requestedPaymentMethod !== "WALLET_QRIS"
  ) {
    throw new Error("Mode bukti QRIS hanya boleh dipakai pada checkout QRIS");
  }
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { payment: true, bridgeClaim: true, qrisInvoiceAttempt: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true, items: true },
  });
  if (existing) {
    if (
      existing.channel !== channel ||
      existing.webCustomerId !== (input.webCustomerId ?? null) ||
      existing.chatId !== input.chatId ||
      existing.items.some((item) => item.productId !== input.productId)
    ) {
      throw new Error("Checkout key sudah digunakan untuk order berbeda");
    }
    assertQrisEvidenceIdempotency({
      attempt: existing.qrisInvoiceAttempt,
      evidenceMode: input.qrisEvidenceMode,
      shopeeSessionId: input.shopeeSessionId,
      message: "Checkout key sudah digunakan untuk bukti QRIS berbeda",
    });
    const idempotentQuantity = normalizeOrderQuantity(
      input.quantity,
      HARD_MAX_ORDER_QUANTITY,
    );
    if (existing.items.length !== idempotentQuantity) {
      throw new Error("Checkout key sudah digunakan untuk jumlah berbeda");
    }
    await queueSoldOutBroadcast(existing);
    if (
      existing.payment &&
      isDanaBridgeOrderPaymentMethod(existing.payment.method) &&
      requestedPaymentMethod !== "WALLET" &&
      (!existing.qrisInvoiceAttempt ||
        qrisProviderUsesDanaRelay(
          existing.qrisInvoiceAttempt.providerKeySnapshot,
        )) &&
      (existing.bridgeClaim?.status === "PENDING" ||
        existing.bridgeClaim?.status === "FAILED")
    ) {
      await registerPaymentClaim(existing.id);
    }
    return existing;
  }
  const quantity = normalizeOrderQuantity(input.quantity);

  const order = await runIdempotentTransactionWithRetry(
    () =>
      prisma.$transaction(async (tx) => {
        // Serialize this buyer's check/count/create even across different products.
        // Keep this before inventory locks so concurrent checkouts use one lock order.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_checkout_buyer_${input.chatId}`}))`;
        await lockInventoryAllocation(tx, input.productId);
    const lockedExisting = await tx.order.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      include: { payment: true, bridgeClaim: true, qrisInvoiceAttempt: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true, items: true },
    });
    if (lockedExisting) {
      if (
        lockedExisting.channel !== channel ||
        lockedExisting.webCustomerId !== (input.webCustomerId ?? null) ||
        lockedExisting.chatId !== input.chatId ||
        lockedExisting.items.some((item) => item.productId !== input.productId)
      ) {
        throw new Error("Checkout key sudah digunakan untuk order berbeda");
      }
      assertQrisEvidenceIdempotency({
        attempt: lockedExisting.qrisInvoiceAttempt,
        evidenceMode: input.qrisEvidenceMode,
        shopeeSessionId: input.shopeeSessionId,
        message: "Checkout key sudah digunakan untuk bukti QRIS berbeda",
      });
      if (lockedExisting.items.length !== quantity) {
        throw new Error("Checkout key sudah digunakan untuk jumlah berbeda");
      }
      return lockedExisting;
    }
    await assertStoreOrderingAvailable(tx);
    const paymentAvailability = await getPaymentMethodAvailability(tx);
    assertCheckoutPaymentMethodEnabled(
      requestedPaymentMethod,
      paymentAvailability,
    );

    const activeInvoiceLimit = channel === "TELEGRAM" ? 5 : 1;
    const activeInvoices = await tx.order.findMany({
      where: {
        chatId: input.chatId,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
        OR: [
          { expiresAt: { gt: new Date() } },
          {
            usdtBep20Attempt: {
              is: {
                status: {
                  in: ["VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"],
                },
                verificationExpiresAt: { gt: new Date() },
              },
            },
          },
          {
            binanceInternalPaymentAttempt: {
              is: {
                status: { in: ["VERIFYING", "VERIFIED"] },
                verificationExpiresAt: { gt: new Date() },
              },
            },
          },
        ],
      },
      select: { id: true, invoiceNumber: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
      take: activeInvoiceLimit,
    });
    if (activeInvoices.length >= activeInvoiceLimit) {
      if (channel === "TELEGRAM") throw new ActiveInvoiceLimitError(activeInvoiceLimit);
      throw new ActiveInvoiceError(activeInvoices[0].id, activeInvoices[0].invoiceNumber);
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
        status: "ACTIVE",
        OR: [
          { groupId: null },
          { group: { is: { status: "ACTIVE" } } },
        ],
      },
      include: {
        group: { select: { id: true, name: true } },
      },
    });
    if (!product) throw new Error("Product is unavailable");

    const subtotal = calculateOrderSubtotal(product.price, quantity);
    let paymentMethod = requestedPaymentMethod;
    let walletContribution = 0;
    if (paymentMethod === "WALLET_QRIS") {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_wallet_${input.chatId}`}))`;
      await tx.wallet.upsert({
        where: { chatId: input.chatId },
        create: {
          chatId: input.chatId,
          buyerUsername: input.buyerUsername?.trim().replace(/^@/, "") || null,
          buyerDisplayName: input.buyerDisplayName?.trim() || null,
        },
        update: {
          buyerUsername: input.buyerUsername?.trim().replace(/^@/, "") || null,
          buyerDisplayName: input.buyerDisplayName?.trim() || null,
        },
      });
      const wallet = await tx.wallet.findUniqueOrThrow({
        where: { chatId: input.chatId },
        select: { balance: true },
      });
      if (wallet.balance >= subtotal) {
        paymentMethod = "WALLET";
      } else if (wallet.balance > 0) {
        walletContribution = wallet.balance;
      } else {
        paymentMethod = "DANA";
      }
    }
    if (
      (input.qrisEvidenceMode || input.shopeeSessionId) &&
      paymentMethod !== "DANA" &&
      paymentMethod !== "WALLET_QRIS"
    ) {
      throw new Error("Checkout QRIS berubah menjadi wallet dan tidak memakai session");
    }
    const usesQris =
      paymentMethod === "DANA" || paymentMethod === "WALLET_QRIS";
    const usesUniqueIdrAmount =
      usesQris || paymentMethod === JAGO_TRANSFER_METHOD;
    assertOrderTotalCapacity(
      subtotal,
      usesUniqueIdrAmount ? UNIQUE_CODE_MAX : 0,
    );

    const usdtSetting =
      paymentMethod === "USDT_BEP20"
        ? await tx.storeRuntimeSetting.findUnique({
            where: { id: "global" },
            select: {
              usdtBep20Enabled: true,
              usdtBep20RecipientAddress: true,
              usdtBep20TokenContract: true,
              usdtBep20TokenDecimals: true,
              usdtBep20RequiredConfirmations: true,
              usdtIdrRate: true,
            },
          })
        : null;
    const [internalSetting, internalRateSetting] =
      paymentMethod === "BINANCE_INTERNAL"
        ? await Promise.all([
            getBinanceInternalSetting(tx),
            getUsdtRateSetting(tx),
          ])
        : [null, null];
    const jagoSetting =
      paymentMethod === JAGO_TRANSFER_METHOD
        ? await getJagoTransferSetting(tx)
        : null;
    if (paymentMethod === "USDT_BEP20") {
      if (!usdtSetting?.usdtBep20Enabled) {
        throw new Error("Pembayaran USDT BEP20 sedang tidak tersedia.");
      }
      normalizeEvmAddress(usdtSetting.usdtBep20RecipientAddress);
      normalizeEvmAddress(usdtSetting.usdtBep20TokenContract);
    }
    if (paymentMethod === "BINANCE_INTERNAL") {
      if (!internalSetting?.enabled || !internalSetting.recipientId) {
        throw new Error("Pembayaran Binance Pay sedang tidak tersedia.");
      }
      if (!internalSetting.verifierReady) {
        throw new Error("Pembayaran Binance Pay sedang tidak tersedia.");
      }
      normalizeBinanceRecipientId(internalSetting.recipientId);
    }
    if (paymentMethod === JAGO_TRANSFER_METHOD) {
      if (!jagoSetting?.enabled || !jagoSetting.accountNumber) {
        throw new Error("Pembayaran transfer Bank Jago sedang tidak tersedia.");
      }
      normalizeJagoAccountNumber(jagoSetting.accountNumber);
    }

    const requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true);
    const sellableWhere = sellableStockWhere(requireHealthy);
    const configuredMaximum = Math.min(
      getMaxOrderQuantity(),
      maxOrderQuantityForUnitPrice(
        product.price,
        usesUniqueIdrAmount ? UNIQUE_CODE_MAX : 0,
      ),
    );
    const [availableStock, reservedUnits, activePreorders] = await Promise.all([
      tx.digitalStockItem.findMany({
        where: {
          productId: product.id,
          archivedAt: null,
          status: "AVAILABLE",
          ...sellableWhere,
        },
        orderBy: { createdAt: "asc" },
        take: configuredMaximum,
        select: { id: true },
      }),
      tx.digitalStockItem.count({
        where: {
          productId: product.id,
          archivedAt: null,
          status: "RESERVED",
          ...sellableWhere,
        },
      }),
      tx.orderItem.count({
        where: {
          productId: product.id,
          stockItemId: null,
          order: {
            isPreorder: true,
            status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] },
          },
        },
      }),
    ]);
    const hasEnoughStock = availableStock.length >= quantity;
    // Notification-backed invoices do not reserve inventory. The first
    // confirmed payment wins; wallet checkout can claim stock immediately.
    const reservedStock =
      paymentMethod === "WALLET" && hasEnoughStock
        ? availableStock.slice(0, quantity)
        : [];

    const quantityCapacity = resolveOrderQuantityCapacity({
      readyStock: availableStock.length,
      reservedStock: reservedUnits,
      preorderEnabled: product.preorderEnabled,
      preorderLimit: product.preorderLimit,
      activePreorders,
      configuredMaximum,
    });
    if (quantityCapacity.maxQuantity > 0) {
      assertOrderQuantityWithinCapacity(quantity, quantityCapacity);
    }

    const availability = resolveCheckoutAvailability({
      stockAvailable: hasEnoughStock,
      reservedUnits,
      preorderEnabled: product.preorderEnabled,
      preorderLimit: product.preorderLimit,
      activePreorders,
      requestedUnits: quantity,
    });
    if (availability === "OUT_OF_STOCK") {
      throw new Error("Stok sehat sedang habis dan preorder tidak aktif");
    }
    if (availability === "WAITING_CHECKOUT") {
      throw new Error(
        "Stok sedang dikunci checkout lain. Coba lagi setelah invoice kedaluwarsa",
      );
    }
    if (availability === "PREORDER_FULL") {
      throw new Error("Slot preorder sedang penuh");
    }
    const isPreorder = availability === "PREORDER";

    const expiresAt = new Date(
      Date.now() + checkoutPaymentExpiryMinutes(paymentMethod) * 60_000,
    );
    const relayBaseAmount = subtotal - walletContribution;
    const serviceFee = usesUniqueIdrAmount
      ? await allocateUniqueCode(tx, relayBaseAmount)
      : 0;
    const grandTotal = assertStoredOrderAmount(subtotal + serviceFee);
    const billedAmount = assertStoredOrderAmount(
      usesUniqueIdrAmount
        ? relayBaseAmount + serviceFee
        : grandTotal,
    );
    const baseUsdtMicros =
      paymentMethod === "USDT_BEP20" && usdtSetting
        ? idrToUsdtMicros(subtotal, usdtSetting.usdtIdrRate)
        : null;
    const usdtQuote =
      baseUsdtMicros === null
        ? null
        : await allocateUsdtBep20UniqueMicros(tx, baseUsdtMicros);
    const baseInternalUsdtMicros =
      paymentMethod === "BINANCE_INTERNAL" && internalRateSetting
        ? idrToUsdtMicros(subtotal, internalRateSetting.rate)
        : null;
    const internalQuote =
      baseInternalUsdtMicros === null
        ? null
        : await allocateBinanceInternalUniqueMicros(tx, baseInternalUsdtMicros);
    const id = randomUUID();
    const invoice = invoiceNumber();
    const now = new Date();
    const paidStatus =
      paymentMethod === "WALLET"
        ? paidOrderStatus({
            isPreorder,
            hasReservedStock: reservedStock.length === quantity,
          })
        : "PENDING_PAYMENT";

    const created = await tx.order.create({
      data: {
        id,
        idempotencyKey: input.idempotencyKey,
        invoiceNumber: invoice,
        chatId: input.chatId,
        channel,
        webCustomerId: input.webCustomerId ?? null,
        buyerEmail: input.buyerEmail?.trim() || null,
        buyerUsername: input.buyerUsername?.trim().replace(/^@/, "") || null,
        buyerDisplayName: input.buyerDisplayName?.trim() || null,
        subtotal,
        serviceFee,
        grandTotal,
        status: paymentMethod === "WALLET" ? paidStatus : "PENDING_PAYMENT",
        paymentStatus: paymentMethod === "WALLET" ? "PAID" : "PENDING",
        isPreorder,
        preorderEtaText: isPreorder ? product.preorderEtaText : null,
        expiresAt,
        paidAt: paymentMethod === "WALLET" ? now : null,
        waitingStockAt:
          paymentMethod === "WALLET" && paidStatus === "PAID_WAITING_STOCK"
            ? now
            : null,
        items: {
          create: Array.from({ length: quantity }, (_, index) => ({
            productId: product.id,
            productNameSnapshot: product.name,
            productGroupIdSnapshot: product.group?.id ?? null,
            productGroupNameSnapshot: product.group?.name ?? null,
            variantLabelSnapshot: product.variantLabel,
            unitPrice: product.price,
            quantity: 1,
            stockItemId: reservedStock[index]?.id,
          })),
        },
        payment: {
          create: {
            invoiceNumber: invoice,
            method:
              paymentMethod === "WALLET"
                ? "WALLET"
                : paymentMethod === "WALLET_QRIS"
                  ? "WALLET_QRIS"
                  : paymentMethod === "USDT_BEP20"
                    ? "USDT_BEP20"
                   : paymentMethod === "BINANCE_INTERNAL"
                     ? "BINANCE_INTERNAL"
                  : paymentMethod === JAGO_TRANSFER_METHOD
                    ? JAGO_TRANSFER_METHOD
                   : "DANA_RELAY",
            billedAmount,
            uniqueCode: usesUniqueIdrAmount ? serviceFee : null,
            status: paymentMethod === "WALLET" ? "PAID" : "PENDING",
            verifiedBy: paymentMethod === "WALLET" ? "wallet" : null,
            verifiedAt: paymentMethod === "WALLET" ? now : null,
            expiresAt,
          },
        },
        ...(paymentMethod === "USDT_BEP20" && usdtSetting && usdtQuote
          ? {
              usdtBep20Attempt: {
                create: {
                  rateSnapshot: usdtSetting.usdtIdrRate,
                  baseUsdtMicros: BigInt(baseUsdtMicros!),
                  uniqueMicros: usdtQuote.uniqueMicros,
                  expectedUsdtMicros: usdtQuote.expectedUsdtMicros,
                  expectedTokenUnits: usdtMicrosToTokenUnits(
                    usdtQuote.expectedUsdtMicros,
                    usdtSetting.usdtBep20TokenDecimals,
                  ).toString(),
                  recipientAddressSnapshot: normalizeEvmAddress(
                    usdtSetting.usdtBep20RecipientAddress,
                  ),
                  tokenContractSnapshot: normalizeEvmAddress(
                    usdtSetting.usdtBep20TokenContract,
                  ),
                  tokenDecimalsSnapshot: usdtSetting.usdtBep20TokenDecimals,
                  chainIdSnapshot: 56,
                  requiredConfirmationsSnapshot:
                    usdtSetting.usdtBep20RequiredConfirmations,
                  expiresAt,
                  verificationExpiresAt: new Date(
                    expiresAt.getTime() +
                      integerEnv("USDT_BEP20_VERIFICATION_GRACE_MINUTES", 60) *
                        60_000,
                  ),
                },
              },
            }
          : {}),
        ...(paymentMethod === "BINANCE_INTERNAL" &&
        internalSetting?.recipientId &&
        internalRateSetting &&
        internalQuote &&
        internalSetting.verifierMode !== "NONE"
          ? {
              binanceInternalPaymentAttempt: {
                create: {
                  rateSnapshot: internalRateSetting.rate,
                  baseUsdtMicros: BigInt(baseInternalUsdtMicros!),
                  uniqueMicros: internalQuote.uniqueMicros,
                  expectedUsdtMicros: internalQuote.expectedUsdtMicros,
                  recipientBinanceIdSnapshot: normalizeBinanceRecipientId(
                    internalSetting.recipientId,
                  ),
                  verifierMode: internalSetting.verifierMode,
                  binanceWebSessionIdSnapshot:
                    internalSetting.verifierMode === "WEB_SESSION"
                      ? internalSetting.web.sessionId
                      : null,
                  binanceAccountFingerprintSnapshot:
                    internalSetting.verifierMode === "WEB_SESSION"
                      ? internalSetting.web.accountFingerprint
                      : null,
                  expiresAt,
                  verificationExpiresAt: new Date(
                    expiresAt.getTime() +
                      integerEnv("BINANCE_PAY_VERIFICATION_GRACE_MINUTES", 60) *
                        60_000,
                  ),
                },
              },
            }
           : {}),
        ...(paymentMethod === JAGO_TRANSFER_METHOD && jagoSetting?.accountNumber
          ? {
              jagoTransferAttempt: {
                create: {
                  recipientAccountNumberSnapshot: normalizeJagoAccountNumber(
                    jagoSetting.accountNumber,
                  ),
                  expiresAt,
                },
              },
            }
          : {}),
      },
      include: { payment: true, bridgeClaim: true, qrisInvoiceAttempt: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true, items: true },
    });

    if (usesQris) {
      const qrisAttempt = await createQrisInvoiceAttempt(
        {
          orderId: created.id,
          amount: billedAmount,
          expiresAt,
          evidenceMode: input.qrisEvidenceMode,
          shopeeSessionId: input.shopeeSessionId,
        },
        tx,
      );
      if (qrisProviderUsesDanaRelay(qrisAttempt.providerKeySnapshot)) {
        await tx.bridgePaymentClaim.create({
          data: {
            claimId: randomUUID(),
            orderId: created.id,
            amount: billedAmount,
            expiresAt,
          },
        });
      }
    }

    if (reservedStock.length > 0) {
      const stockClaim = await tx.digitalStockItem.updateMany({
        where: {
          id: { in: reservedStock.map((stock) => stock.id) },
          archivedAt: null,
          status: "AVAILABLE",
          ...sellableWhere,
        },
        data: {
          status: "RESERVED",
          reservedOrderId: created.id,
          reservedAt: new Date(),
        },
      });
      if (stockClaim.count !== quantity) {
        throw new Error("Stok berubah saat checkout diproses");
      }
    }

    if (paymentMethod === "WALLET" || walletContribution > 0) {
      await applyWalletTransaction(tx, {
        chatId: input.chatId,
        amount: -(paymentMethod === "WALLET" ? subtotal : walletContribution),
        type: "PURCHASE_DEBIT",
        idempotencyKey: `purchase:${created.id}`,
        orderId: created.id,
        identity: {
          buyerUsername: input.buyerUsername,
          buyerDisplayName: input.buyerDisplayName,
        },
        note:
          paymentMethod === "WALLET"
            ? `Pembelian ${quantity}x ${product.name}`
            : `Saldo untuk pembayaran gabungan ${quantity}x ${product.name}`,
      });
      if (paymentMethod === "WALLET" && reservedStock.length > 0) {
        await queueOrderDigitalDelivery(tx, {
          orderId: created.id,
          chatId: created.chatId,
          channel: created.channel,
          stockItemIds: reservedStock.map((stock) => stock.id),
        });
      }
    }

        return tx.order.findUniqueOrThrow({
          where: { id: created.id },
          include: { payment: true, bridgeClaim: true, qrisInvoiceAttempt: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true, items: true },
        });
      }),
    { label: "create-digital-order" },
  );

  await queueSoldOutBroadcast(order);

  if (order.bridgeClaim) {
    await registerPaymentClaim(order.id);
  } else {
    const productId = order.items[0]?.productId;
    if (order.status === "PAID_WAITING_STOCK" && productId) {
      await allocatePaidPreorders(productId, 1);
    }
  }
  return prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { payment: true, bridgeClaim: true, qrisInvoiceAttempt: true, usdtBep20Attempt: true, binanceInternalPaymentAttempt: true, jagoTransferAttempt: true, items: true },
  });
}
