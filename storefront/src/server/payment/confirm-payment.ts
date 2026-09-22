import { booleanEnv } from "@/server/env";
import { prisma } from "@/server/db/prisma";
import { runIdempotentTransactionWithRetry } from "@/server/db/transaction-retry";
import { lockInventoryAllocation } from "@/server/checkout/inventory-lock";
import { allocatePaidPreorders } from "@/server/preorder/allocate-stock";
import { paidOrderStatus } from "@/server/preorder/policy";
import {
  queueOrderDigitalDelivery,
  queueOrderPaymentSuccess,
  queueOrderWalletRefund,
} from "@/server/orders/delivery-channel";
import { enqueueProductSoldOut } from "@/server/telegram/product-broadcast";
import { cleanError } from "@/server/utils/format";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { sellableStockWhere } from "@/server/stock/sellable";
import { assignOrderItemsToStock } from "@/server/orders/stock-assignment";
import { parsePositiveUsdtMicros } from "@/server/payment/binance-internal-amount";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import { jagoTransferConfirmationBlockReason } from "@/server/payment/jago-transfer-policy";
import {
  confirmOrderBridgeStateTx,
  confirmOrderProviderStateTx,
} from "@/server/payment/confirmation/provider-state";
import {
  isQrisOrderPaymentMethod,
  qrisInvoiceEventBlockReason,
} from "@/server/payment/qris-attempt-policy";
import { shopeePartnerTransactionBlockReason } from "@/server/payment/shopee-partner-matching";
import { assertShopeeAndroidFallbackGraceElapsed } from "@/server/payment/shopee-partner-fallback";
import { binanceWebTransactionBlockReason } from "@/server/payment/binance-web-policy";
import { isAdminShopeePaymentOverride } from "@/server/payment/shopee-manual-policy";
import { ManualCryptoApprovalError, validateManualCryptoApproval, type ManualCryptoApproval } from "./manual-crypto-policy";
import { claimManualCryptoReference } from "./confirmation/manual-crypto-evidence";

export function isManualJagoPaymentConfirmation(input: {
  paymentMethod: string;
  verifiedBy: string;
  bridgeEventId?: string;
  allowManualJagoOverride?: boolean;
}): boolean {
  return input.paymentMethod === JAGO_TRANSFER_METHOD &&
    input.allowManualJagoOverride === true &&
    input.verifiedBy.startsWith("admin:") &&
    !input.bridgeEventId;
}

export async function confirmOrderPayment(input: {
  orderId: string;
  verifiedBy: string;
  bridgeEventId?: string;
  usdtBep20AttemptId?: string;
  binanceInternalAttemptId?: string;
  shopeePartnerTransactionId?: string;
  allowManualJagoOverride?: boolean;
  allowRejectedJagoEvent?: boolean;
  allowRejectedQrisEvent?: boolean;
  allowManualShopeeOverride?: boolean;
  manualCryptoApproval?: ManualCryptoApproval;
}) {
  const confirmed = await runIdempotentTransactionWithRetry(
    () =>
      prisma.$transaction(async (tx) => {
    // The product is immutable on an order item. Read it before taking the
    // lock, then re-read the order after locks are acquired for a fresh state.
    const lockHint = await tx.order.findUnique({
      where: { id: input.orderId },
      select: { items: { select: { productId: true }, orderBy: { createdAt: "asc" }, take: 1 } },
    });
    const inventoryProductId = lockHint?.items[0]?.productId;
    if (!inventoryProductId) throw new Error("Order product not found");
    await lockInventoryAllocation(tx, inventoryProductId);
    await lockOrderPaymentTransition(tx, input.orderId);

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        payment: true,
        bridgeClaim: true,
        qrisInvoiceAttempt: true,
        jagoTransferAttempt: true,
        items: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order || !order.payment) throw new Error("Order payment not found");
    const manualCryptoApproval = validateManualCryptoApproval(order.payment.method, input.verifiedBy, input.manualCryptoApproval);
    const manualJagoConfirmation = isManualJagoPaymentConfirmation({
      paymentMethod: order.payment.method,
      verifiedBy: input.verifiedBy,
      bridgeEventId: input.bridgeEventId,
      allowManualJagoOverride: input.allowManualJagoOverride,
    });
    const usdtAttempt =
      order.payment.method === "USDT_BEP20"
        ? await tx.usdtBep20Attempt.findFirst({
            where: {
              ...(manualCryptoApproval ? {} : { id: input.usdtBep20AttemptId ?? "" }),
              orderId: order.id,
            },
          })
        : null;
    const binanceAttempt =
      order.payment.method === "BINANCE_INTERNAL"
        ? await tx.binanceInternalPaymentAttempt.findFirst({
            where: {
              ...(manualCryptoApproval ? {} : { id: input.binanceInternalAttemptId ?? "" }),
              orderId: order.id,
            },
            include: { webTransaction: true },
          })
        : null;
    const bridgeEvent = input.bridgeEventId
      ? await tx.bridgePaymentEvent.findUnique({
            where: { eventId: input.bridgeEventId },
            select: {
              id: true,
              eventId: true,
              source: true,
              provider: true,
              claimId: true,
              deviceId: true,
              packageName: true,
              amount: true,
              postedAt: true,
              receivedAt: true,
              status: true,
              orderId: true,
              walletTopupId: true,
            },
          })
      : null;
    const shopeeTransaction =
      input.shopeePartnerTransactionId &&
      order.qrisInvoiceAttempt?.shopeeAccountFingerprintSnapshot
        ? await tx.shopeePartnerTransaction.findFirst({
            where: {
              externalTransactionId: input.shopeePartnerTransactionId,
              merchantAccountFingerprint:
                order.qrisInvoiceAttempt.shopeeAccountFingerprintSnapshot,
            },
            select: {
              id: true,
              externalTransactionId: true,
              merchantAccountFingerprint: true,
              service: true,
              transactionType: true,
              statusCode: true,
              amount: true,
              occurredAt: true,
              status: true,
              qrisInvoiceAttemptId: true,
            },
          })
        : null;
    const jagoEvent =
      order.payment.method === JAGO_TRANSFER_METHOD ? bridgeEvent : null;
    const usesShopeeWebEvidence =
      order.qrisInvoiceAttempt?.evidenceMode === "WEB_SESSION";
    const manualShopeeConfirmation = isAdminShopeePaymentOverride({
      evidenceMode: order.qrisInvoiceAttempt?.evidenceMode,
      providerKey: order.qrisInvoiceAttempt?.providerKeySnapshot,
      verifiedBy: input.verifiedBy,
      allowOverride: input.allowManualShopeeOverride,
      bridgeEventId: input.bridgeEventId,
      shopeeTransactionId: input.shopeePartnerTransactionId,
    });
    const allowShopeeAndroidFallback =
      booleanEnv("SHOPEE_ANDROID_FALLBACK_ENABLED", true) &&
      order.qrisInvoiceAttempt?.providerKeySnapshot === "SHOPEE_PARTNER";
    if (usesShopeeWebEvidence) {
      if (
        !order.qrisInvoiceAttempt ||
        order.qrisInvoiceAttempt.amount !== order.payment.billedAmount ||
        order.qrisInvoiceAttempt.expiresAt.getTime() !== order.payment.expiresAt.getTime()
      ) {
        throw new Error("Shopee invoice snapshot amount or expiry mismatch");
      }
      if (input.bridgeEventId && !allowShopeeAndroidFallback) {
        throw new Error("Shopee web-session invoice cannot use Android bridge evidence");
      }
      if (input.bridgeEventId && bridgeEvent && allowShopeeAndroidFallback) {
        assertShopeeAndroidFallbackGraceElapsed({ receivedAt: bridgeEvent.receivedAt });
      }
      if (input.shopeePartnerTransactionId) {
        const blockReason = shopeePartnerTransactionBlockReason({
          transaction: shopeeTransaction ?? {
            externalTransactionId: input.shopeePartnerTransactionId,
            merchantAccountFingerprint: "",
            service: 0,
            transactionType: 0,
            statusCode: 0,
            amount: 0,
            occurredAt: new Date(0),
            status: "MISSING",
            qrisInvoiceAttemptId: null,
          },
          invoiceAttempt: order.qrisInvoiceAttempt!,
          allowConfirmed: order.paymentStatus === "PAID",
        });
        if (blockReason) throw new Error(blockReason);
      } else if (!input.bridgeEventId && order.paymentStatus !== "PAID" && !manualShopeeConfirmation) {
        throw new Error("Shopee web-session transaction evidence is required");
      }
    } else if (input.shopeePartnerTransactionId) {
      throw new Error("Shopee transaction evidence is not attached to this invoice");
    }
    if (order.paymentStatus === "PAID") {
      if (input.bridgeEventId) {
        if (
          !bridgeEvent ||
          bridgeEvent.status !== "CONFIRMED" ||
          bridgeEvent.orderId !== order.id ||
          bridgeEvent.walletTopupId !== null ||
          bridgeEvent.amount !== order.payment.billedAmount
        ) {
          throw new Error("Order was already paid by another payment event");
        }
      }
      return order;
    }
    if (
      order.payment.method === "USDT_BEP20" && !manualCryptoApproval &&
      (!usdtAttempt ||
        usdtAttempt.status !== "VERIFIED" ||
        !usdtAttempt.txHash ||
        !usdtAttempt.submittedAt ||
        !usdtAttempt.verifiedAt ||
        !usdtAttempt.blockTimestamp ||
        usdtAttempt.submittedAt > usdtAttempt.expiresAt ||
        usdtAttempt.blockTimestamp > usdtAttempt.expiresAt ||
        usdtAttempt.verifiedAt > usdtAttempt.verificationExpiresAt)
    ) {
      throw new Error("USDT BEP20 transfer must be verified on-chain first");
    }
    if (order.payment.method === "BINANCE_INTERNAL" && !manualCryptoApproval) {
      if (!binanceAttempt) {
        throw new Error("Binance Pay transaction must be verified first");
      }
      if (binanceAttempt.verifierMode === "WEB_SESSION") {
        const blockReason = binanceWebTransactionBlockReason({
          transaction: binanceAttempt.webTransaction,
          attempt: binanceAttempt,
        });
        if (blockReason) throw new Error(blockReason);
      } else if (
        binanceAttempt.status !== "VERIFIED" ||
        !binanceAttempt.submittedOrderId ||
        !binanceAttempt.canonicalTransactionId ||
        !binanceAttempt.submittedAt ||
        !binanceAttempt.verifiedAt ||
        !binanceAttempt.observedAmount ||
        !binanceAttempt.observedTransactionTime ||
        binanceAttempt.submittedAt > binanceAttempt.expiresAt ||
        binanceAttempt.verifiedAt > binanceAttempt.verificationExpiresAt ||
        binanceAttempt.observedTransactionTime <
          new Date(binanceAttempt.createdAt.getTime() - 120_000) ||
        binanceAttempt.observedTransactionTime > binanceAttempt.expiresAt ||
        binanceAttempt.observedCurrency !== "USDT" ||
        !["C2C", "PAY"].includes(binanceAttempt.observedOrderType ?? "") ||
        binanceAttempt.observedReceiverBinanceId !==
          binanceAttempt.recipientBinanceIdSnapshot ||
        parsePositiveUsdtMicros(binanceAttempt.observedAmount.toString()) !==
          binanceAttempt.expectedUsdtMicros
      ) {
        throw new Error("Binance Pay transaction must be verified first");
      }
    }
    if (order.payment.method === JAGO_TRANSFER_METHOD && !manualJagoConfirmation) {
      const blockReason = jagoTransferConfirmationBlockReason({
        bridgeEventId: input.bridgeEventId,
        allowRejectedEvent:
          input.allowRejectedJagoEvent === true &&
          input.verifiedBy.startsWith("admin:"),
        payment: order.payment,
        attempt: order.jagoTransferAttempt,
        event: jagoEvent,
      });
      if (blockReason) throw new Error(blockReason);
    }
    if (isQrisOrderPaymentMethod(order.payment.method) && bridgeEvent) {
      const blockReason = qrisInvoiceEventBlockReason({
        targetKind: "order",
        targetId: order.id,
        billedAmount: order.payment.billedAmount,
        createdAt: order.payment.createdAt,
        expiresAt: order.payment.expiresAt,
        bridgeClaim: order.bridgeClaim,
        attempt: order.qrisInvoiceAttempt,
        event: bridgeEvent,
        allowRejectedEvent:
          input.allowRejectedQrisEvent === true &&
          input.verifiedBy.startsWith("admin:"),
        allowShopeeAndroidFallback,
      });
      if (blockReason) throw new Error(blockReason);
    }
    if (order.expiresAt <= new Date() && !usdtAttempt && !binanceAttempt) {
      throw new Error("Invoice has expired");
    }
    if (order.status !== "PENDING_PAYMENT" || order.payment.status !== "PENDING") {
      throw new Error("Order is not awaiting payment");
    }
    if (manualCryptoApproval) {
      if (order.expiresAt <= new Date() || order.payment.expiresAt <= new Date()) throw new ManualCryptoApprovalError("payment_expired");
      if (input.bridgeEventId || input.shopeePartnerTransactionId || input.usdtBep20AttemptId || input.binanceInternalAttemptId) throw new ManualCryptoApprovalError("manual_approval_not_allowed");
      await claimManualCryptoReference(tx, { method: order.payment.method, orderId: order.id, approval: manualCryptoApproval, usdt: usdtAttempt, binance: binanceAttempt });
    }

    if (order.items.length === 0) throw new Error("Order item not found");
    let stockItemIds = order.items.flatMap((item) =>
      item.stockItemId ? [item.stockItemId] : [],
    );
    if (stockItemIds.length > 0 && stockItemIds.length !== order.items.length) {
      throw new Error("Order memiliki alokasi stok parsial dan perlu review admin");
    }

    const productId = order.items[0]?.productId;
    if (!productId) throw new Error("Order product not found");
    if (!order.isPreorder && stockItemIds.length === 0) {
      const requireHealthy = booleanEnv("STOCK_REQUIRE_HEALTHY", true);
      const sellableWhere = sellableStockWhere(requireHealthy);
      const availableStock = await tx.digitalStockItem.findMany({
        where: {
          productId,
          archivedAt: null,
          status: "AVAILABLE",
          ...sellableWhere,
        },
        orderBy: { createdAt: "asc" },
        take: order.items.length,
      });

      if (availableStock.length < order.items.length) {
        const now = new Date();
        await tx.payment.update({
          where: { id: order.payment.id },
          data: { status: "PAID", verifiedBy: input.verifiedBy, verifiedAt: now },
        });
        await tx.order.update({
          where: { id: order.id },
          data: {
            status: "REFUNDED",
            paymentStatus: "PAID",
            paidAt: now,
            refundedAt: now,
          },
        });
        await confirmOrderProviderStateTx(tx, {
          paymentMethod: order.payment.method,
          usdtAttemptId: usdtAttempt?.id,
          binanceAttemptId: binanceAttempt?.id,
          binanceWebTransactionId: binanceAttempt?.webTransaction?.id,
          jagoAttemptId: order.jagoTransferAttempt?.id,
          qrisAttemptId: order.qrisInvoiceAttempt?.id,
          shopeeTransactionId: shopeeTransaction?.id,
          bridgeEventId: input.bridgeEventId,
          bridgeEventDatabaseId: bridgeEvent?.id,
          manualJagoConfirmation,
          manualCryptoConfirmation: Boolean(manualCryptoApproval),
          confirmedAt: now,
        });
        await confirmOrderBridgeStateTx(tx, {
          orderId: order.id,
          bridgeEventId: input.bridgeEventId,
          confirmedAt: now,
        });
        await applyWalletTransaction(tx, {
          chatId: order.chatId,
          amount: order.grandTotal,
          type: "STOCK_UNAVAILABLE_REFUND",
          idempotencyKey: `stock-unavailable-refund:${order.id}`,
          orderId: order.id,
          identity: {
            buyerUsername: order.buyerUsername,
            buyerDisplayName: order.buyerDisplayName,
          },
          actor: "system:payment-confirmation",
          note: `Refund ${order.invoiceNumber}: stok habis sebelum pembayaran terkonfirmasi`,
        });
        await queueOrderWalletRefund(tx, order, "STOCK_UNAVAILABLE");
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { payment: true, items: true },
        });
      }

      const claimed = await tx.digitalStockItem.updateMany({
          where: {
            id: { in: availableStock.map((stock) => stock.id) },
            archivedAt: null,
            status: "AVAILABLE",
          ...sellableWhere,
        },
        data: {
          status: "RESERVED",
          reservedOrderId: order.id,
          reservedAt: new Date(),
        },
      });
      if (claimed.count !== order.items.length) {
        throw new Error("Stok berubah saat pembayaran dikonfirmasi");
      }
      const assigned = await assignOrderItemsToStock(
        tx,
        order.items.map((item, index) => ({
          orderItemId: item.id,
          stockItemId: availableStock[index].id,
        })),
      );
      if (assigned !== order.items.length) {
        throw new Error("Alokasi item order berubah saat pembayaran dikonfirmasi");
      }
      stockItemIds = availableStock.map((stock) => stock.id);
    }

    const nextStatus = paidOrderStatus({
      isPreorder: order.isPreorder,
      hasReservedStock: stockItemIds.length === order.items.length,
    });
    const now = new Date();

    const paymentUpdated = await tx.payment.updateMany({
      where: { id: order.payment.id, status: "PENDING" },
      data: { status: "PAID", verifiedBy: input.verifiedBy, verifiedAt: now },
    });
    const orderUpdated = await tx.order.updateMany({
      where: {
        id: order.id,
        status: "PENDING_PAYMENT",
        paymentStatus: "PENDING",
      },
      data: {
        status: nextStatus,
        paymentStatus: "PAID",
        paidAt: now,
        waitingStockAt: nextStatus === "PAID_WAITING_STOCK" ? now : null,
      },
    });
    if (paymentUpdated.count !== 1 || orderUpdated.count !== 1) {
      throw new Error("Order payment state changed during confirmation");
    }
    await confirmOrderProviderStateTx(tx, {
      paymentMethod: order.payment.method,
      usdtAttemptId: usdtAttempt?.id,
      binanceAttemptId: binanceAttempt?.id,
      binanceWebTransactionId: binanceAttempt?.webTransaction?.id,
      jagoAttemptId: order.jagoTransferAttempt?.id,
      qrisAttemptId: order.qrisInvoiceAttempt?.id,
      shopeeTransactionId: shopeeTransaction?.id,
      bridgeEventId: input.bridgeEventId,
      bridgeEventDatabaseId: bridgeEvent?.id,
      manualJagoConfirmation,
      manualCryptoConfirmation: Boolean(manualCryptoApproval),
      confirmedAt: now,
    });
    await confirmOrderBridgeStateTx(tx, {
      orderId: order.id,
      bridgeEventId: input.bridgeEventId,
      confirmedAt: now,
    });
    await queueOrderPaymentSuccess(tx, order);
    if (stockItemIds.length > 0) {
      await queueOrderDigitalDelivery(tx, {
        orderId: order.id,
        chatId: order.chatId,
        channel: order.channel,
        stockItemIds,
      });
    }
        return tx.order.findUniqueOrThrow({
          where: { id: order.id },
          include: { payment: true, items: true },
        });
      }),
    { label: "confirm-order-payment", maxAttempts: 3 },
  );

  const productId = confirmed.items[0]?.productId;
  if (confirmed.status === "PAID_WAITING_STOCK" && productId) {
    await allocatePaidPreorders(productId, 1);
  }
  if (confirmed.status === "FULFILLING" && productId) {
    try {
      await enqueueProductSoldOut({ productId, orderId: confirmed.id });
    } catch (error) {
      console.warn("[Product sold-out notification]", cleanError(error));
    }
  }

  return prisma.order.findUniqueOrThrow({
    where: { id: confirmed.id },
    include: { payment: true, items: true },
  });
}
