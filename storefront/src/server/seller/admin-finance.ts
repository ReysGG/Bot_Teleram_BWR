import { prisma } from "@/server/db/prisma";

export async function transitionSellerWithdrawal(input: { id: string; actor: string; action: "approve" | "reject" | "start" | "paid" | "fail"; reference?: string; reason?: string }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-withdrawal:${input.id}`}))`;
    const w = await tx.sellerWithdrawal.findUnique({ where: { id: input.id }, include: { seller: true } });
    if (!w) throw new Error("withdrawal_not_found");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-wallet:${w.sellerId}`}))`;
    const allowed: Record<string, string[]> = { approve:["REQUESTED"], reject:["REQUESTED","APPROVED"], start:["APPROVED"], paid:["PROCESSING"], fail:["PROCESSING"] };
    if (!allowed[input.action]?.includes(w.status)) throw new Error("withdrawal_state_changed");
    if (input.action === "approve") return tx.sellerWithdrawal.update({ where: { id:w.id }, data:{status:"APPROVED",operator:input.actor,version:{increment:1}} });
    if (input.action === "start") return tx.sellerWithdrawal.update({ where: { id:w.id }, data:{status:"PROCESSING",operator:input.actor,version:{increment:1}} });
    if (input.action === "reject" || input.action === "fail") {
      await tx.sellerWallet.update({ where:{sellerId:w.sellerId}, data:{held:{decrement:w.amount},available:{increment:w.amount}} });
      await tx.sellerJournal.create({data:{sellerId:w.sellerId,sourceKey:`seller-withdrawal-release:${w.id}:${input.action}`,kind:`WITHDRAWAL_${input.action.toUpperCase()}`,available:w.amount,held:-w.amount,actor:input.actor,reason:input.reason??"Admin rejected/failed withdrawal"}});
      return tx.sellerWithdrawal.update({where:{id:w.id},data:{status:input.action === "reject" ? "REJECTED" : "FAILED_FINAL",operator:input.actor,reason:input.reason??null,version:{increment:1}}});
    }
    if (!input.reference?.trim()) throw new Error("transfer_reference_required");
    await tx.sellerWallet.update({where:{sellerId:w.sellerId},data:{held:{decrement:w.amount}}});
    await tx.sellerJournal.create({data:{sellerId:w.sellerId,sourceKey:`seller-withdrawal-paid:${w.id}`,kind:"WITHDRAWAL_PAID",clearing:w.amount,held:-w.amount,actor:input.actor,reason:`Manual payout ${input.reference}`}});
    return tx.sellerWithdrawal.update({where:{id:w.id},data:{status:"PAID",operator:input.actor,reference:input.reference.trim(),paidAt:new Date(),version:{increment:1}}});
  });
}
