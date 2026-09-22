import { createZipArchive } from "@/server/files/zip";
import { decryptStockFile } from "@/server/stock/inventory";

export const MAX_SELECTED_STOCK_EXPORT_ITEMS = 100;
export const MAX_STOCK_EXPORT_ITEMS = 5_000;
export const MAX_STOCK_EXPORT_BYTES = 24 * 1024 * 1024;
export const STOCK_EXPORT_PAGE_SIZE = 100;

export type StockExportErrorCode =
  | "stock-download-empty"
  | "stock-download-limit"
  | "stock-download-missing"
  | "stock-download-unavailable";

export class StockExportError extends Error {
  constructor(
    public readonly code: StockExportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StockExportError";
  }
}

export type StockExportRecord = {
  id: string;
  originalFilename: string;
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
};

export async function createStockExportArchive(
  pages: AsyncIterable<StockExportRecord[]>,
  limits: { maxBytes?: number; maxItems?: number } = {},
): Promise<Buffer> {
  const maxBytes = limits.maxBytes ?? MAX_STOCK_EXPORT_BYTES;
  const maxItems = limits.maxItems ?? MAX_STOCK_EXPORT_ITEMS;
  const entries: Array<{ filename: string; content: Buffer }> = [];
  const decryptedBuffers: Buffer[] = [];
  let totalBytes = 0;

  try {
    for await (const page of pages) {
      for (const item of page) {
        if (entries.length >= maxItems) {
          throw new StockExportError(
            "stock-download-limit",
            `Stock export exceeds ${maxItems} items`,
          );
        }

        let content: Buffer;
        try {
          content = decryptStockFile(item);
        } catch {
          throw new StockExportError(
            "stock-download-unavailable",
            `Stock item ${item.id} could not be decrypted`,
          );
        }
        decryptedBuffers.push(content);
        totalBytes += content.byteLength;
        if (totalBytes > maxBytes) {
          throw new StockExportError(
            "stock-download-limit",
            `Stock export exceeds ${maxBytes} bytes`,
          );
        }
        entries.push({ filename: item.originalFilename, content });
      }
    }

    if (entries.length === 0) {
      throw new StockExportError(
        "stock-download-empty",
        "No stock items are available for export",
      );
    }

    return createZipArchive(entries);
  } finally {
    for (const content of decryptedBuffers) content.fill(0);
  }
}
