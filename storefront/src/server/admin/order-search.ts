import { Prisma } from "@/generated/prisma/client";

export function normalizeAdminSearch(value: string | undefined): string {
  return value?.trim().slice(0, 120) ?? "";
}

export function orderSearchWhere(value: string | undefined): Prisma.OrderWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  const username = query.replace(/^@/, "");

  return {
    OR: [
      { buyerUsername: { contains: username, mode: "insensitive" } },
      { buyerDisplayName: { contains: query, mode: "insensitive" } },
      { buyerEmail: { contains: query, mode: "insensitive" } },
      { chatId: { contains: query } },
      { invoiceNumber: { contains: query, mode: "insensitive" } },
      {
        items: {
          some: {
            OR: [
              { productNameSnapshot: { contains: query, mode: "insensitive" } },
              { productGroupNameSnapshot: { contains: query, mode: "insensitive" } },
              { variantLabelSnapshot: { contains: query, mode: "insensitive" } },
            ],
          },
        },
      },
    ],
  };
}
