import { prisma } from "@/server/db/prisma";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import { isQrisOrderPaymentMethod } from "@/server/payment/qris-attempt-policy";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function confirmOrderProviderStateTx(
  tx: TransactionClient,
  input: {
    paymentMethod: string;
    usdtAttemptId?: string;
    binanceAttemptId?: string;
    binanceWebTransactionId?: string;
    jagoAttemptId?: string;
    qrisAttemptId?: string;
    shopeeTransactionId?: string;
    bridgeEventId?: string;
    bridgeEventDatabaseId?: string;
    manualJagoConfirmation: boolean;
    manualCryptoConfirmation?: boolean;
    confirmedAt: Date;
  },
) {
  if (input.paymentMethod === "USDT_BEP20") {
    if (!input.usdtAttemptId) throw new Error("USDT BEP20 attempt not found");
    const updated = await tx.usdtBep20Attempt.updateMany({
      where: { id: input.usdtAttemptId, status: input.manualCryptoConfirmation ? { in: ["AWAITING_TX_HASH", "VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED", "REJECTED"] } : "VERIFIED" },
      data: { status: "CONFIRMED", confirmedAt: input.confirmedAt },
    });
    if (updated.count !== 1) {
      throw new Error("USDT BEP20 verification state changed during confirmation");
    }
  }
  if (input.paymentMethod === "BINANCE_INTERNAL") {
    if (!input.binanceAttemptId) throw new Error("Binance Pay attempt not found");
    const updated = await tx.binanceInternalPaymentAttempt.updateMany({
      where: { id: input.binanceAttemptId, status: input.manualCryptoConfirmation ? { in: ["AWAITING_ORDER_ID", "VERIFYING", "VERIFIED", "REJECTED"] } : "VERIFIED" },
      data: { status: "CONFIRMED", confirmedAt: input.confirmedAt },
    });
    if (updated.count !== 1) {
      throw new Error("Binance Pay verification state changed during confirmation");
    }
    if (input.binanceWebTransactionId) {
      const transactionUpdated = await tx.binanceWebTransaction.updateMany({
        where: {
          id: input.binanceWebTransactionId,
          binanceInternalPaymentAttemptId: input.binanceAttemptId,
          status: "MATCHED",
        },
        data: { status: "CONFIRMED", confirmedAt: input.confirmedAt },
      });
      if (transactionUpdated.count !== 1) {
        throw new Error("Binance web transaction state changed during confirmation");
      }
    }
  }
  if (
    input.paymentMethod === JAGO_TRANSFER_METHOD &&
    (input.bridgeEventId || input.manualJagoConfirmation)
  ) {
    if (!input.jagoAttemptId) throw new Error("Jago transfer attempt not found");
    const updated = await tx.jagoTransferAttempt.updateMany({
      where: {
        id: input.jagoAttemptId,
        status: "AWAITING_TRANSFER",
        matchedEventId: null,
      },
      data: {
        status: "CONFIRMED",
        matchedEventId: input.bridgeEventId ?? null,
        matchedAt: input.confirmedAt,
      },
    });
    if (updated.count !== 1) {
      throw new Error("Jago transfer state changed during confirmation");
    }
  }
  if (isQrisOrderPaymentMethod(input.paymentMethod) && input.qrisAttemptId) {
    const updated = await tx.qrisInvoiceAttempt.updateMany({
      where: {
        id: input.qrisAttemptId,
        status: { in: ["AWAITING_PAYMENT", "MATCHED"] },
        matchedEventId: null,
      },
      data: {
        status: "CONFIRMED",
        matchedEventId: input.bridgeEventDatabaseId ?? null,
        matchedAt: input.bridgeEventDatabaseId ? input.confirmedAt : null,
      },
    });
    if (updated.count !== 1) {
      throw new Error("QRIS invoice state changed during confirmation");
    }
    if (input.shopeeTransactionId) {
      const transactionUpdated = await tx.shopeePartnerTransaction.updateMany({
        where: {
          id: input.shopeeTransactionId,
          qrisInvoiceAttemptId: input.qrisAttemptId,
          status: "MATCHED",
        },
        data: { status: "CONFIRMED", confirmedAt: input.confirmedAt },
      });
      if (transactionUpdated.count !== 1) {
        throw new Error("Shopee transaction state changed during confirmation");
      }
    }
  }
}

export async function confirmOrderBridgeStateTx(
  tx: TransactionClient,
  input: { orderId: string; bridgeEventId?: string; confirmedAt: Date },
) {
  await tx.bridgePaymentClaim.updateMany({
    where: { orderId: input.orderId },
    data: { status: "CONFIRMED", confirmedAt: input.confirmedAt },
  });
  if (input.bridgeEventId) {
    await tx.bridgePaymentEvent.update({
      where: { eventId: input.bridgeEventId },
      data: {
        status: "CONFIRMED",
        orderId: input.orderId,
        confirmedAt: input.confirmedAt,
      },
    });
  }
}
