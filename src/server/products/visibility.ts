import type { Prisma } from "@/generated/prisma/client";

/** Active variants are public only while their parent group is also active. */
export function activePublicProductWhere(
  productId?: string,
): Prisma.ProductWhereInput {
  return {
    ...(productId ? { id: productId } : {}),
    status: "ACTIVE",
    OR: [
      { groupId: null },
      { group: { is: { status: "ACTIVE" } } },
    ],
  };
}
