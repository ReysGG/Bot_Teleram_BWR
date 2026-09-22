import { prisma } from "@/server/db/prisma";
import { allowedPayoutActions, payoutActions, type PayoutAction } from "@/lib/seller-withdrawal-policy";

export async function transitionSellerWithdrawal(input: { id: string; actor: string; action: PayoutAction; version: number; reference?: string; reason?: string }) {
  const policy = payoutActions[input.action];
  const reason = input.reason?.trim() ?? "";
  const reference = input.reference?.trim() ?? "";
  if (policy.reason && (reason.length < 5 || reason.length > 1000)) throw new Error("withdrawal_reason_required");
  if (policy.reference && (!reference || reference.length > 200)) throw new Error("transfer_reference_required");
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-withdrawal:${input.id}`}))`;
    const withdrawal = await tx.sellerWithdrawal.findUnique({ where: { id: input.id }, include: { seller: true, account: true } });
    if (!withdrawal) throw new Error("withdrawal_not_found");
    if (withdrawal.version !== input.version || !allowedPayoutActions(withdrawal.status).includes(input.action)) throw new Error("withdrawal_state_changed");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-wallet:${withdrawal.sellerId}`}))`;
    if (["approve", "start"].includes(input.action) && (withdrawal.seller.status !== "ACTIVE" || withdrawal.account.status !== "VERIFIED" || withdrawal.account.sellerId !== withdrawal.sellerId)) throw new Error("payout_account_not_ready");
    const release = input.action === "reject" || input.action === "fail";
    if (release || input.action === "paid") {
      const adjusted = await tx.sellerWallet.updateMany({ where: { sellerId: withdrawal.sellerId, held: { gte: withdrawal.amount } }, data: {
        held: { decrement: withdrawal.amount }, ...(release ? { available: { increment: withdrawal.amount } } : {}),
      } });
      if (adjusted.count !== 1) throw new Error("withdrawal_balance_mismatch");
      await tx.sellerJournal.create({ data: {
        sellerId: withdrawal.sellerId, sourceKey: `seller-withdrawal-settle:${withdrawal.id}`,
        kind: `WITHDRAWAL_${policy.to}`, held: -withdrawal.amount,
        available: release ? withdrawal.amount : 0n, clearing: release ? 0n : withdrawal.amount,
        actor: input.actor, reason: reason || `Manual payout ${reference}`,
      } });
    }
    const result = await tx.sellerWithdrawal.update({ where: { id: withdrawal.id }, data: {
      status: policy.to, operator: input.actor, version: { increment: 1 },
      ...(reason ? { reason } : {}), ...(input.action === "paid" ? { reference, paidAt: new Date() } : {}),
    } });
    await tx.sellerAudit.create({ data: { sellerId: withdrawal.sellerId, actor: input.actor, action: `WITHDRAWAL_${policy.to}`, target: withdrawal.id, detail: `${withdrawal.status} -> ${policy.to}` } });
    return result;
  });
}
