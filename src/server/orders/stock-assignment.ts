import { Prisma } from "@/generated/prisma/client";

export type OrderItemStockAssignment = {
  orderItemId: string;
  stockItemId: string;
};

function assertUniqueAssignments(assignments: OrderItemStockAssignment[]) {
  const orderItemIds = new Set<string>();
  const stockItemIds = new Set<string>();

  for (const assignment of assignments) {
    if (!assignment.orderItemId || !assignment.stockItemId) {
      throw new Error("Order item and stock assignment IDs are required");
    }
    if (orderItemIds.has(assignment.orderItemId)) {
      throw new Error("Order item assignment is duplicated");
    }
    if (stockItemIds.has(assignment.stockItemId)) {
      throw new Error("Stock item assignment is duplicated");
    }
    orderItemIds.add(assignment.orderItemId);
    stockItemIds.add(assignment.stockItemId);
  }
}

/** Assign a large stock batch in one statement to keep payment transactions short. */
export async function assignOrderItemsToStock(
  tx: Prisma.TransactionClient,
  assignments: OrderItemStockAssignment[],
): Promise<number> {
  if (assignments.length === 0) return 0;
  assertUniqueAssignments(assignments);

  const rows = assignments.map((assignment) =>
    Prisma.sql`(${assignment.orderItemId}::text, ${assignment.stockItemId}::text)`,
  );

  return tx.$executeRaw(
    Prisma.sql`
      UPDATE "OrderItem" AS target
      SET "stockItemId" = assignment."stockItemId"
      FROM (VALUES ${Prisma.join(rows)}) AS assignment("orderItemId", "stockItemId")
      WHERE target.id = assignment."orderItemId"
        AND target."stockItemId" IS NULL
    `,
  );
}
