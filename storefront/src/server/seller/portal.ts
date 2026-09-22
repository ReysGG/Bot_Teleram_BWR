import { prisma } from "@/server/db/prisma";

/**
 * Read models for the seller portal.  These queries intentionally scope every
 * child collection by sellerId so a stale Clerk membership can never expose a
 * different seller's records.
 */
export async function getSellerDashboard(sellerId: string) {
  const [seller, wallet, draftCounts, productCount, saleCount, recentSales, recentWithdrawals] =
    await Promise.all([
      prisma.sellerAccount.findUnique({ where: { id: sellerId }, select: { id: true, displayName: true, slug: true, status: true, commissionBps: true } }),
      prisma.sellerWallet.findUnique({ where: { sellerId }, select: { pending: true, available: true, held: true, debt: true, updatedAt: true } }),
      prisma.sellerProductDraft.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } }),
      prisma.product.count({ where: { sellerId } }),
      prisma.sellerSale.count({ where: { sellerId } }),
      prisma.sellerSale.findMany({
        where: { sellerId }, orderBy: { createdAt: "desc" }, take: 5,
        select: { id: true, gross: true, net: true, commission: true, status: true, createdAt: true, orderItem: { select: { productNameSnapshot: true, quantity: true, order: { select: { invoiceNumber: true } } } } },
      }),
      prisma.sellerWithdrawal.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, amount: true, status: true, createdAt: true, account: { select: { bank: true, masked: true } } } }),
    ]);

  const drafts = Object.fromEntries(draftCounts.map((row) => [row.status, row._count._all]));
  return { seller, wallet, draftCounts: drafts, productCount, saleCount, recentSales, recentWithdrawals };
}

export async function getSellerProducts(sellerId: string) {
  const [products, drafts] = await Promise.all([
    prisma.product.findMany({ where: { sellerId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, slug: true, name: true, variantLabel: true, price: true, status: true, preorderEnabled: true, createdAt: true, updatedAt: true, _count: { select: { stockItems: true, orderItems: true } } } }),
    prisma.sellerProductDraft.findMany({ where: { sellerId }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, name: true, description: true, price: true, status: true, revision: true, reviewReason: true, publishedProductId: true, createdAt: true, updatedAt: true } }),
  ]);
  return { products, drafts };
}

export async function getSellerSales(sellerId: string) {
  return prisma.sellerSale.findMany({
    where: { sellerId }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, gross: true, commission: true, net: true, status: true, holdSeconds: true, eligibleAt: true, createdAt: true, orderItem: { select: { productNameSnapshot: true, variantLabelSnapshot: true, quantity: true, unitPrice: true, order: { select: { invoiceNumber: true, status: true, paymentStatus: true, createdAt: true } } } } },
  });
}

export async function getSellerBalance(sellerId: string) {
  const [wallet, journals] = await Promise.all([
    prisma.sellerWallet.findUnique({ where: { sellerId }, select: { pending: true, available: true, held: true, debt: true, updatedAt: true } }),
    prisma.sellerJournal.findMany({ where: { sellerId }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, kind: true, pending: true, available: true, held: true, debt: true, clearing: true, reason: true, createdAt: true } }),
  ]);
  return { wallet, journals };
}

export async function getSellerWithdrawals(sellerId: string) {
  return prisma.sellerWithdrawal.findMany({
    where: { sellerId }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, amount: true, status: true, version: true, operator: true, reference: true, reason: true, paidAt: true, createdAt: true, updatedAt: true, account: { select: { bank: true, holder: true, masked: true, status: true } } },
  });
}

export async function getSellerPayoutAccounts(sellerId: string) {
  return prisma.sellerPayoutAccount.findMany({ where: { sellerId, status: "VERIFIED" }, orderBy: { createdAt: "desc" }, select: { id: true, bank: true, holder: true, masked: true, status: true } });
}

export async function getAdminSellerIndex() {
  return prisma.sellerAccount.findMany({
    orderBy: { createdAt: "desc" }, take: 200,
    select: { id: true, slug: true, displayName: true, status: true, commissionBps: true, createdAt: true, updatedAt: true, memberships: { select: { active: true, clerkUserId: true, createdAt: true } }, _count: { select: { products: true, drafts: true, sales: true, withdrawals: true, invitations: true } }, wallet: { select: { pending: true, available: true, held: true, debt: true } } },
  });
}

export async function getAdminSellerDetail(sellerId: string) {
  return prisma.sellerAccount.findUnique({
    where: { id: sellerId },
    select: { id: true, slug: true, displayName: true, status: true, commissionBps: true, policyVersion: true, createdAt: true, updatedAt: true, memberships: { select: { active: true, clerkIssuer: true, clerkUserId: true, createdAt: true } }, invitations: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, emailHash: true, expiresAt: true, acceptedAt: true, createdBy: true, createdAt: true } }, payoutAccounts: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, bank: true, holder: true, masked: true, status: true, verifiedAt: true, createdAt: true } }, withdrawals: { orderBy: { createdAt: "desc" }, take: 50, select: { id: true, amount: true, status: true, operator: true, reference: true, reason: true, paidAt: true, createdAt: true, account: { select: { bank: true, masked: true } } } }, drafts: { orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, name: true, status: true, price: true, revision: true, reviewReason: true, updatedAt: true } }, wallet: { select: { pending: true, available: true, held: true, debt: true, updatedAt: true } } },
  });
}

export async function getAdminSellerWithdrawals() {
  return prisma.sellerWithdrawal.findMany({ where: { status: { not: "PAID" } }, orderBy: { createdAt: "asc" }, take: 200, select: { id: true, amount: true, status: true, operator: true, reference: true, reason: true, createdAt: true, seller: { select: { id: true, displayName: true, slug: true, status: true } }, account: { select: { bank: true, holder: true, masked: true, status: true } } } });
}

export async function getAdminSellerWithdrawal(id: string) {
  return prisma.sellerWithdrawal.findUnique({
    where: { id },
    select: {
      id: true, amount: true, status: true, operator: true, reference: true,
      reason: true, paidAt: true, createdAt: true, updatedAt: true, version: true,
      seller: { select: { id: true, displayName: true, slug: true, status: true } },
      account: { select: { id: true, bank: true, holder: true, masked: true, status: true } },
    },
  });
}
