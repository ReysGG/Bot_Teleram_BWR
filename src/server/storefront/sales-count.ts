import { prisma } from "@/server/db/prisma";

// One OrderItem represents one purchased unit. Both channels share this ledger.
// Use order history rather than stock status, which changes after delivery.
export async function soldUnitsByProduct(productIds: string[]) {
  if (!productIds.length) return new Map<string, number>();
  const rows = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: {
        paymentStatus: "PAID",
        status: { in: ["PAID", "PAID_WAITING_STOCK", "FULFILLING", "COMPLETED"] },
        refundedAt: null,
      },
    },
    _count: { _all: true },
  });
  return new Map(rows.map(row => [row.productId, row._count._all]));
}
