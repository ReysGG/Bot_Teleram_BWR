import { prisma } from "@/server/db/prisma";
import { applyWalletTransaction } from "@/server/wallet/ledger";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function releasePendingWalletContribution(
  tx: TransactionClient,
  input: {
    orderId: string;
    chatId: string;
    buyerUsername?: string | null;
    buyerDisplayName?: string | null;
    reason: "cancelled" | "expired";
  },
) {
  const debit = await tx.walletTransaction.findFirst({
    where: {
      orderId: input.orderId,
      type: "PURCHASE_DEBIT",
      amount: { lt: 0 },
    },
    select: { amount: true },
  });
  if (!debit) return null;

  return applyWalletTransaction(tx, {
    chatId: input.chatId,
    amount: Math.abs(debit.amount),
    type: "PAYMENT_RELEASE_REFUND",
    idempotencyKey: `pending-payment-release:${input.orderId}`,
    orderId: input.orderId,
    identity: {
      buyerUsername: input.buyerUsername,
      buyerDisplayName: input.buyerDisplayName,
    },
    actor: "system:payment-release",
    note:
      input.reason === "cancelled"
        ? "Saldo dikembalikan karena pembayaran dibatalkan"
        : "Saldo dikembalikan karena invoice kedaluwarsa",
  });
}
