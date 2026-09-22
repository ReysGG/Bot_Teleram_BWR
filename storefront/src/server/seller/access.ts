import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/server/db/prisma";
import { redirect } from "next/navigation";

export async function requireSellerShell() {
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
