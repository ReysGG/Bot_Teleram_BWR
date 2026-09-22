import type { Prisma } from "@/generated/prisma/client";
import { decodeStockText, decryptStockFile } from "@/server/stock/inventory";

export const CONTENT_SEARCH_BATCH_SIZE = 100;
const select = {
  id: true, originalFilename: true, status: true, archivedAt: true,
  deliveredAt: true, encryptedPayload: true, encryptionIv: true, encryptionTag: true,
  product: { select: { name: true } },
  orderItem: { select: { order: { select: {
    id: true, invoiceNumber: true, status: true, chatId: true,
    buyerEmail: true, buyerUsername: true, buyerDisplayName: true,
  } } } },
} satisfies Prisma.DigitalStockItemSelect;

export async function searchInventoryContent(
  client: Pick<Prisma.TransactionClient, "digitalStockItem">,
  input: { query: string; productId?: string; after?: string },
) {
  const needle = input.query.trim().toLowerCase();
  if (needle.length < 4 || needle.length > 256) throw new Error("INVALID_QUERY");
  const rows = await client.digitalStockItem.findMany({
    where: {
      ...(input.productId ? { productId: input.productId } : {}),
      ...(input.after ? { id: { gt: input.after } } : {}),
    },
    orderBy: { id: "asc" }, take: CONTENT_SEARCH_BATCH_SIZE + 1, select,
  });
  const batch = rows.slice(0, CONTENT_SEARCH_BATCH_SIZE);
  const matches = [];
  let unreadable = 0;
  let nonText = 0;
  for (const item of batch) {
    let buffer: Buffer | undefined;
    try {
      buffer = decryptStockFile(item);
      const text = decodeStockText(buffer);
      if (text === null) { nonText++; continue; }
      if (!text.toLowerCase().includes(needle)) continue;
      // Never return the query, credential, surrounding text or encryption fields.
      matches.push({
        id: item.id, filename: item.originalFilename, product: item.product.name,
        status: item.status, archived: Boolean(item.archivedAt),
        deliveredAt: item.deliveredAt?.toISOString() ?? null,
        order: item.orderItem?.order ?? null,
      });
    } catch { unreadable++; }
    finally { buffer?.fill(0); }
  }
  return {
    matches, scanned: batch.length, unreadable, nonText,
    next: rows.length > CONTENT_SEARCH_BATCH_SIZE ? batch.at(-1)!.id : null,
  };
}
