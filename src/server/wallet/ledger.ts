import { prisma } from "@/server/db/prisma";
import {
  serializeWalletAdjustmentNotification,
  walletAdjustmentDedupeKey,
} from "@/server/wallet/notification";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export type WalletMutationType =
  | "TOPUP_CREDIT"
  | "ADMIN_CREDIT"
  | "ADMIN_DEBIT"
  | "PURCHASE_DEBIT"
  | "PAYMENT_RELEASE_REFUND"
  | "DELIVERY_REFUND"
  | "STOCK_UNAVAILABLE_REFUND"
  | "PREORDER_CANCEL_REFUND"
  | "SMS_PURCHASE_DEBIT"
  | "SMS_PURCHASE_REFUND"
  | "REFERRAL_REWARD"
  | "REFERRAL_JOIN_BONUS";

type WalletIdentity = {
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
};

function identityData(identity: WalletIdentity | undefined) {
  return {
    ...(identity?.buyerUsername === undefined
      ? {}
      : { buyerUsername: identity.buyerUsername?.trim().replace(/^@/, "") || null }),
    ...(identity?.buyerDisplayName === undefined
      ? {}
      : { buyerDisplayName: identity.buyerDisplayName?.trim() || null }),
  };
}

export async function ensureWallet(
  chatId: string,
  identity?: WalletIdentity,
) {
  return prisma.wallet.upsert({
    where: { chatId },
    create: { chatId, ...identityData(identity) },
    update: identityData(identity),
  });
}

export async function applyWalletTransaction(
  tx: TransactionClient,
  input: {
    chatId: string;
    amount: number;
    type: WalletMutationType;
    idempotencyKey: string;
    identity?: WalletIdentity;
    orderId?: string;
    walletTopupId?: string;
    note?: string;
    actor?: string;
  },
) {
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) {
    throw new Error("Nominal mutasi wallet harus berupa bilangan bulat non-zero");
  }

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_wallet_${input.chatId}`}))`;
  await tx.wallet.upsert({
    where: { chatId: input.chatId },
    create: { chatId: input.chatId, ...identityData(input.identity) },
    update: identityData(input.identity),
  });

  const existing = await tx.walletTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (
      existing.walletChatId !== input.chatId ||
      existing.amount !== input.amount ||
      existing.type !== input.type
    ) {
      throw new Error("Idempotency key wallet digunakan untuk mutasi berbeda");
    }
    return existing;
  }

  const wallet = await tx.wallet.findUniqueOrThrow({
    where: { chatId: input.chatId },
  });
  const balanceAfter = wallet.balance + input.amount;
  if (balanceAfter < 0) throw new Error("Saldo wallet tidak mencukupi");

  await tx.wallet.update({
    where: { chatId: input.chatId },
    data: { balance: balanceAfter, ...identityData(input.identity) },
  });
  return tx.walletTransaction.create({
    data: {
      walletChatId: input.chatId,
      type: input.type,
      amount: input.amount,
      balanceBefore: wallet.balance,
      balanceAfter,
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId,
      walletTopupId: input.walletTopupId,
      note: input.note?.trim().slice(0, 500) || null,
      actor: input.actor?.trim().slice(0, 200) || null,
    },
  });
}

export async function adjustWalletBalance(input: {
  chatId: string;
  amount: number;
  idempotencyKey: string;
  actor: string;
  note?: string;
}) {
  const type = input.amount > 0 ? "ADMIN_CREDIT" : "ADMIN_DEBIT";
  return prisma.$transaction(async (tx) => {
    const transaction = await applyWalletTransaction(tx, {
      chatId: input.chatId,
      amount: input.amount,
      type,
      idempotencyKey: input.idempotencyKey,
      actor: input.actor,
      note: input.note,
    });
    await tx.telegramNotification.upsert({
      where: { dedupeKey: walletAdjustmentDedupeKey(transaction.id) },
      create: {
        dedupeKey: walletAdjustmentDedupeKey(transaction.id),
        chatId: input.chatId,
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
    return transaction;
  });
}
