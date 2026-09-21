import { prisma } from "@/server/db/prisma";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import { externalIdrProviderForOrderPaymentMethod } from "@/server/payment/provider-methods";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { webCustomerChatId } from "@/server/storefront/customer-access";
import {
  serializeWalletAdjustmentNotification,
  walletAdjustmentDedupeKey,
} from "@/server/wallet/notification";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export function expiredOrderWalletCreditKey(orderId: string) {
  return `expired-order-payment-credit:${orderId}`;
}

export function isExpiredOrderWalletCreditPaymentMethod(method: string): boolean {
  return externalIdrProviderForOrderPaymentMethod(method) !== null;
}

export function expiredOrderWalletCreditAmount(input: {
  billedAmount: number;
  uniqueCode: number | null;
  serviceFee: number;
}): number {
  const uniqueCode = input.uniqueCode ?? input.serviceFee;
  const amount = input.billedAmount - uniqueCode;
  if (
    !Number.isSafeInteger(input.billedAmount) ||
    !Number.isSafeInteger(uniqueCode) ||
    !Number.isSafeInteger(amount) ||
    uniqueCode < 0 ||
    amount <= 0
  ) {
    throw new Error("Nominal pembayaran expired tidak valid");
  }
  return amount;
}

export async function creditExpiredOrderPaymentToWalletTx(
  tx: TransactionClient,
  input: {
    orderId: string;
    actor: string;
    note?: string;
    bridgeEventId?: string;
    bridgeEventDatabaseId?: string;
  },
) {
    await lockOrderPaymentTransition(tx, input.orderId);
    const idempotencyKey = expiredOrderWalletCreditKey(input.orderId);
    const existing = await tx.walletTransaction.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return { transaction: existing, credited: false };

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        payment: true,
        items: { select: { stockItemId: true } },
        deliveryReceipts: { select: { id: true }, take: 1 },
        notifications: {
          where: { kind: "DIGITAL_FILE" },
          select: { id: true },
          take: 1,
        },
        qrisInvoiceAttempt: true,
      },
    });
    if (!order?.payment) throw new Error("Order expired tidak ditemukan");
    if (order.channel === "WEB" && (!order.webCustomerId || order.chatId !== webCustomerChatId(order.webCustomerId))) {
      throw new Error("Pemilik wallet order Web tidak valid");
    }
    if (
      order.status !== "EXPIRED" ||
      order.paymentStatus !== "EXPIRED" ||
      order.payment.status !== "EXPIRED" ||
      !isExpiredOrderWalletCreditPaymentMethod(order.payment.method)
    ) {
      throw new Error("Order tidak memenuhi syarat kredit wallet expired");
    }
    const linkedStockCount = await tx.digitalStockItem.count({
      where: {
        OR: [
          { reservedOrderId: order.id },
          { deliveredOrderId: order.id },
        ],
      },
    });
    if (
      order.items.some((item) => item.stockItemId !== null) ||
      order.deliveryReceipts.length > 0 ||
      order.notifications.length > 0 ||
      linkedStockCount > 0
    ) {
      throw new Error(
        "Order pernah masuk proses pengiriman dan harus diperiksa manual",
      );
    }

    const amount = expiredOrderWalletCreditAmount({
      billedAmount: order.payment.billedAmount,
      uniqueCode: order.payment.uniqueCode,
      serviceFee: order.serviceFee,
    });
    const now = new Date();
    const transaction = await applyWalletTransaction(tx, {
      chatId: order.chatId,
      amount,
      type: "ADMIN_CREDIT",
      idempotencyKey,
      orderId: order.id,
      identity: {
        buyerUsername: order.buyerUsername,
        buyerDisplayName: order.buyerDisplayName,
      },
      actor: input.actor,
      note:
        input.note ??
        `Pembayaran expired ${order.invoiceNumber} dimasukkan ke wallet tanpa kode unik`,
    });

    const [paymentUpdated, orderUpdated] = await Promise.all([
      tx.payment.updateMany({
        where: { id: order.payment.id, status: "EXPIRED" },
        data: { status: "PAID", verifiedBy: input.actor, verifiedAt: now },
      }),
      tx.order.updateMany({
        where: { id: order.id, status: "EXPIRED", paymentStatus: "EXPIRED" },
        data: { paymentStatus: "PAID", paidAt: now },
      }),
    ]);
    if (paymentUpdated.count !== 1 || orderUpdated.count !== 1) {
      throw new Error("Order berubah saat kredit wallet diproses");
    }

    await tx.bridgePaymentClaim.updateMany({
      where: { orderId: order.id },
      data: { status: "CONFIRMED", confirmedAt: now },
    });
    if (order.payment.method === JAGO_TRANSFER_METHOD) {
      const attemptUpdated = await tx.jagoTransferAttempt.updateMany({
        where: {
          orderId: order.id,
          status: { in: ["AWAITING_TRANSFER", "EXPIRED"] },
          matchedEventId: null,
        },
        data: {
          status: "CONFIRMED",
          matchedEventId: input.bridgeEventId ?? null,
          matchedAt: now,
        },
      });
      if (attemptUpdated.count !== 1) {
        throw new Error("Order Jago expired tidak memiliki attempt yang dapat dikreditkan");
      }
    }
    if (order.qrisInvoiceAttempt) {
      const attemptUpdated = await tx.qrisInvoiceAttempt.updateMany({
        where: {
          id: order.qrisInvoiceAttempt.id,
          status: { in: ["AWAITING_PAYMENT", "MATCHED", "EXPIRED"] },
          matchedEventId: null,
        },
        data: {
          status: "CONFIRMED",
          matchedEventId: input.bridgeEventDatabaseId ?? null,
          matchedAt: input.bridgeEventDatabaseId ? now : null,
        },
      });
      if (attemptUpdated.count !== 1) {
        throw new Error("Order QRIS expired tidak memiliki attempt yang dapat dikreditkan");
      }
    }
    if (order.channel !== "WEB") await tx.telegramNotification.upsert({
      where: { dedupeKey: walletAdjustmentDedupeKey(transaction.id) },
      create: {
        dedupeKey: walletAdjustmentDedupeKey(transaction.id),
        chatId: order.chatId,
        orderId: order.id,
        kind: "WALLET_ADJUSTMENT",
        priority: 15,
        messageText: serializeWalletAdjustmentNotification({
          amount: transaction.amount,
          balanceBefore: transaction.balanceBefore,
          balanceAfter: transaction.balanceAfter,
          note: transaction.note,
        }),
      },
      update: {},
    });
    return { transaction, credited: true };
}

export async function creditExpiredOrderPaymentToWallet(input: {
  orderId: string;
  adminEmail: string;
}) {
  return prisma.$transaction(async (tx) => {
    return creditExpiredOrderPaymentToWalletTx(tx, {
      orderId: input.orderId,
      actor: `admin:${input.adminEmail}`,
    });
  });
}
