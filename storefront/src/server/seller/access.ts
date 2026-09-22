import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";
import { isLocalPreview } from "@/lib/runtime-env";

async function localPreviewSeller() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('local-preview-seller'))`;
    const seller = await tx.sellerAccount.upsert({
      where: { slug: "local-preview-seller" },
      create: { slug: "local-preview-seller", displayName: "Local Preview Seller", status: "ACTIVE" },
      update: { status: "ACTIVE" },
    });
    await tx.sellerWallet.upsert({ where: { sellerId: seller.id }, create: { sellerId: seller.id }, update: {} });
    await tx.sellerMembership.upsert({ where: { sellerId: seller.id }, create: { sellerId: seller.id, clerkIssuer: "local-preview", clerkUserId: "local-preview", active: true }, update: { clerkIssuer: "local-preview", clerkUserId: "local-preview", active: true } });
    await tx.sellerMembership.upsert({
      where: { sellerId: seller.id },
      create: { sellerId: seller.id, clerkIssuer: "local-preview", clerkUserId: "local-preview", active: true },
      update: { clerkIssuer: "local-preview", clerkUserId: "local-preview", active: true },
    });
    return seller;
  });
}

export async function requireSellerShell() {
  if (isLocalPreview()) return { kind: "active" as const, seller: await localPreviewSeller() };
  if (process.env.SELLER_PORTAL_ENABLED !== "true") return { kind: "disabled" as const, seller: null };
  const identity = await auth();
  if (!identity.userId) return { kind: "guest" as const, seller: null };
  const issuer = identity.sessionClaims?.iss;
  if (typeof issuer !== "string" || issuer !== process.env.SELLER_CLERK_ISSUER) return { kind: "unavailable" as const, seller: null };
  const membership = await prisma.sellerMembership.findUnique({
    where: { clerkIssuer_clerkUserId: { clerkIssuer: issuer, clerkUserId: identity.userId } },
    include: { seller: true },
  });
  if (!membership) return { kind: "uninvited" as const, seller: null };
  if (!membership.active || membership.seller.status !== "ACTIVE") return { kind: "restricted" as const, seller: null };
  return { kind: "active" as const, seller: membership.seller };
}

export async function requireSellerPage() {
  const state = await requireSellerShell();
  if (!state.seller || state.kind !== "active") redirect("/seller");
  return state.seller;
}

export async function requireActiveSeller() {
  const state = await requireSellerShell();
  if (!state.seller || state.kind !== "active") throw new Error("seller_access_required");
  return state.seller;
}
