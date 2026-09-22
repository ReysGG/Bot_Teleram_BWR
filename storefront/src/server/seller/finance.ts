import { prisma } from "@/server/db/prisma";
import { z } from "zod";

export const withdrawalInput = z.object({
  amount: z.coerce.bigint().positive(),
  accountId: z.string().min(1).max(100),
  requestKey: z.string().uuid(),
}).strict();

export async function sellerBalance(sellerId: string) {
  const wallet = await prisma.sellerWallet.findUnique({ where: { sellerId } });
  const [sales, withdrawals] = await Promise.all([
    prisma.sellerSale.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, net: true, status: true, eligibleAt: true, createdAt: true, orderItemId: true } }),
    prisma.sellerWithdrawal.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 25, select: { id: true, amount: true, status: true, createdAt: true, updatedAt: true } }),
  ]);
  return { wallet: wallet ? { pending: wallet.pending.toString(), available: wallet.available.toString(), held: wallet.held.toString(), debt: wallet.debt.toString() } : { pending: "0", available: "0", held: "0", debt: "0" }, sales: sales.map(s => ({ ...s, net: s.net.toString() })), withdrawals: withdrawals.map(w => ({ ...w, amount: w.amount.toString() })) };
}

export async function requestSellerWithdrawal(sellerId: string, raw: unknown) {
  const input = withdrawalInput.parse(raw);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-wallet:${sellerId}`}))`;
    const existing = await tx.sellerWithdrawal.findUnique({ where: { sellerId_requestKey: { sellerId, requestKey: input.requestKey } } });
    if (existing) return existing;
    const account = await tx.sellerPayoutAccount.findFirst({ where: { id: input.accountId, sellerId, status: "VERIFIED" }, select: { id: true } });
    if (!account) throw new Error("payout_account_not_ready");
    const wallet = await tx.sellerWallet.findUnique({ where: { sellerId } });
    if (!wallet || wallet.available < input.amount) throw new Error("insufficient_available_balance");
    const withdrawal = await tx.sellerWithdrawal.create({ data: { sellerId, accountId: account.id, amount: input.amount, requestKey: input.requestKey, status: "REQUESTED" } });
    await tx.sellerWallet.update({ where: { sellerId }, data: { available: { decrement: input.amount }, held: { increment: input.amount } } });
    await tx.sellerJournal.create({ data: { sellerId, sourceKey: `seller-withdrawal-reserve:${withdrawal.id}`, kind: "WITHDRAWAL_RESERVE", available: -input.amount, held: input.amount, actor: sellerId, reason: "Seller withdrawal request" } });
    return withdrawal;
  });
}
