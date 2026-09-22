import { Prisma } from "@/generated/prisma/client";
import { normalizeAdminSearch } from "@/server/admin/order-search";

export function productSearchWhere(value: string | undefined): Prisma.ProductWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  return {
    OR: [
      { name: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { descriptionEn: { contains: query, mode: "insensitive" } },
      { attachmentOriginalFilename: { contains: query, mode: "insensitive" } },
      { variantLabel: { contains: query, mode: "insensitive" } },
      { group: { name: { contains: query, mode: "insensitive" } } },
    ],
  };
}

export function inventorySearchWhere(
  value: string | undefined,
): Prisma.DigitalStockItemWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  return {
    OR: [
      { originalFilename: { contains: query, mode: "insensitive" } },
      { credentialFingerprint: { contains: query, mode: "insensitive" } },
      { product: { name: { contains: query, mode: "insensitive" } } },
      {
        orderItem: {
          is: { order: { invoiceNumber: { contains: query, mode: "insensitive" } } },
        },
      },
    ],
  };
}

export function walletSearchWhere(value: string | undefined): Prisma.WalletWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  const username = query.replace(/^@/, "");
  return {
    OR: [
      { buyerUsername: { contains: username, mode: "insensitive" } },
      { buyerDisplayName: { contains: query, mode: "insensitive" } },
      { chatId: { contains: query } },
    ],
  };
}

export function walletTopupSearchWhere(
  value: string | undefined,
): Prisma.WalletTopupWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  const username = query.replace(/^@/, "");
  const paymentMethod = /jago/i.test(query)
    ? "JAGO_TRANSFER"
    : /qris|dana/i.test(query)
      ? "DANA_RELAY"
      : null;
  return {
    OR: [
      { invoiceNumber: { contains: query, mode: "insensitive" } },
      { chatId: { contains: query } },
      { wallet: { buyerUsername: { contains: username, mode: "insensitive" } } },
      { wallet: { buyerDisplayName: { contains: query, mode: "insensitive" } } },
      ...(paymentMethod ? [{ paymentMethod }] : []),
    ],
  };
}

export function walletTransactionSearchWhere(
  value: string | undefined,
): Prisma.WalletTransactionWhereInput {
  const query = normalizeAdminSearch(value);
  if (!query) return {};
  return {
    OR: [
      { note: { contains: query, mode: "insensitive" } },
      { actor: { contains: query, mode: "insensitive" } },
      { order: { invoiceNumber: { contains: query, mode: "insensitive" } } },
      { walletTopup: { invoiceNumber: { contains: query, mode: "insensitive" } } },
    ],
  };
}
