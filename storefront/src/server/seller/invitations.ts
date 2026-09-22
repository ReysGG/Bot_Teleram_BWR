import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { sha256 } from "@/server/security/crypto";

const inputSchema = z.object({ email: z.string().trim().email().max(254), displayName: z.string().trim().min(2).max(100), slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80) }).strict();
export async function createLocalSellerInvitation(actor: string, raw: unknown) {
  if (process.env.APP_ENV === "production") throw new Error("invite_delivery_not_configured");
  const input = inputSchema.parse(raw); const token = randomBytes(32).toString("base64url"); const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); const emailHash = sha256(`seller-invite-email\0${input.email.toLowerCase()}`);
  const result = await prisma.$transaction(async tx => { const seller = await tx.sellerAccount.upsert({ where: { slug: input.slug }, create: { slug: input.slug, displayName: input.displayName, status: "INVITED" }, update: { displayName: input.displayName } }); const invitation = await tx.sellerInvitation.create({ data: { sellerId: seller.id, tokenHash: sha256(`seller-invite-token\0${token}`), emailHash, expiresAt, createdBy: actor } }); return { invitationId: invitation.id, expiresAt, token }; });
  return { ...result, invitePath: `/seller/login?invite=${encodeURIComponent(result.token)}` };
}
