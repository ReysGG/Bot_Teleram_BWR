import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { parseAdminProductInput } from "@/server/products/admin";

export const sellerDraftInput = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(10000),
  price: z.coerce.number().int().positive().max(1000000000),
  requestKey: z.string().uuid(),
}).strict();

export async function createSellerDraft(sellerId: string, raw: unknown) {
  const input = sellerDraftInput.parse(raw);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller:${sellerId}`}))`;
    const seller = await tx.sellerAccount.findFirst({ where: { id: sellerId, status: "ACTIVE", memberships: { some: { active: true } } } });
    if (!seller) throw new Error("seller_access_required");
    const existing = await tx.sellerProductDraft.findUnique({ where: { sellerId_requestKey: { sellerId, requestKey: input.requestKey } } });
    if (existing) {
      if (existing.name !== input.name || existing.description !== input.description || existing.price !== input.price) throw new Error("request_conflict");
      return existing;
    }
    return tx.sellerProductDraft.create({ data: { ...input, sellerId } });
  });
}

export async function submitSellerDraft(sellerId: string, draftId: string, revision: number) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller:${sellerId}`}))`;
    const seller = await tx.sellerAccount.findFirst({ where: { id: sellerId, status: "ACTIVE", memberships: { some: { active: true } } } });
    if (!seller) throw new Error("seller_access_required");
    const draft = await tx.sellerProductDraft.findFirst({ where: { id: draftId, sellerId, revision } });
    if (!draft) throw new Error("draft_changed");
    if (draft.status === "SUBMITTED") return draft;
    if (draft.status !== "DRAFT") throw new Error("draft_changed");
    return tx.sellerProductDraft.update({ where: { id: draft.id }, data: { status: "SUBMITTED" } });
  });
}

export async function updateSellerDraft(sellerId: string, draftId: string, revision: number, raw: unknown) {
  const input = sellerDraftInput.omit({ requestKey: true }).parse(raw);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller:${sellerId}`}))`;
    const seller = await tx.sellerAccount.findFirst({ where: { id: sellerId, status: "ACTIVE", memberships: { some: { active: true } } } });
    if (!seller) throw new Error("seller_access_required");
    const draft = await tx.sellerProductDraft.findFirst({ where: { id: draftId, sellerId, revision } });
    if (!draft || !["DRAFT", "REJECTED"].includes(draft.status)) throw new Error("draft_changed");
    return tx.sellerProductDraft.update({ where: { id: draft.id }, data: { ...input, revision: { increment: 1 }, status: "DRAFT", reviewReason: null } });
  });
}

export async function reviewSellerDraft(draftId: string, revision: number, decision: "approve" | "reject", actor: string, reason: string) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seller-draft:${draftId}`}))`;
    const draft = await tx.sellerProductDraft.findUnique({ where: { id: draftId }, include: { seller: true } });
    if (!draft || draft.revision !== revision) throw new Error("draft_changed");
    if (draft.status === "APPROVED" && decision === "approve") return draft;
    if (draft.status !== "SUBMITTED") throw new Error("draft_changed");
    if (decision === "reject") {
      if (reason.trim().length < 5 || reason.length > 1000) throw new Error("review_reason_required");
      return tx.sellerProductDraft.update({ where: { id: draftId }, data: { status: "REJECTED", reviewReason: reason.trim(), reviewedBy: actor } });
    }
    if (draft.seller.status !== "ACTIVE") throw new Error("seller_access_required");
    const details = parseAdminProductInput({ name: draft.name, description: draft.description, price: draft.price });
    // Keep approved products paused until seller settlement and checkout gates
    // pass local acceptance. This cannot publish unfinished financial behavior.
    const product = await tx.product.create({ data: { ...details, slug: `seller-${draft.id}`, sellerId: draft.sellerId, status: "INACTIVE" } });
    return tx.sellerProductDraft.update({ where: { id: draftId }, data: { status: "APPROVED", reviewedBy: actor, reviewReason: null, publishedProductId: product.id } });
  });
}
