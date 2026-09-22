import { prisma } from "@/server/db/prisma";

type StoreTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function lockInventoryAllocation(
  tx: StoreTransaction,
  productId?: string,
): Promise<void> {
  if (!productId) {
    // Legacy callers that mutate multiple products retain an exclusive store lock.
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('telegram_store_checkout'))",
    );
    return;
  }

  // Checkouts for different products can proceed in parallel. The shared store
  // lock keeps them coordinated with legacy all-inventory mutations, while the
  // per-product lock serializes stock claims for the same product.
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock_shared(hashtext('telegram_store_checkout'))",
  );
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_product_inventory_${productId}`}))`;
}
