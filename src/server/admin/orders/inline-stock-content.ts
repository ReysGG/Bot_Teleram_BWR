import { decryptStockFile } from "@/server/stock/inventory";

export const MAX_ADMIN_INLINE_STOCK_BYTES = 16 * 1024;
export const MAX_ADMIN_INLINE_ORDER_BYTES = 256 * 1024;

export type AdminInlineStockContent =
  | { kind: "text"; text: string; byteLength: number }
  | { kind: "unsupported" | "binary" | "too-large" | "unavailable" };

export function formatAdminInlineStockText(
  filename: string,
  content: Buffer,
  maxBytes = MAX_ADMIN_INLINE_STOCK_BYTES,
): AdminInlineStockContent {
  if (!/\.txt$/i.test(filename)) return { kind: "unsupported" };
  if (content.byteLength > maxBytes) return { kind: "too-large" };

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return { kind: "binary" };
  }
  if (!decoded.trim() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(decoded)) {
    return { kind: "binary" };
  }
  return { kind: "text", text: decoded, byteLength: content.byteLength };
}

export function adminInlineStockContent(
  item: {
    originalFilename: string;
    encryptedPayload: string;
    encryptionIv: string;
    encryptionTag: string;
  },
  maxBytes = MAX_ADMIN_INLINE_STOCK_BYTES,
): AdminInlineStockContent {
  if (!/\.txt$/i.test(item.originalFilename)) return { kind: "unsupported" };
  let plaintext: Buffer | null = null;
  try {
    plaintext = decryptStockFile(item);
    return formatAdminInlineStockText(
      item.originalFilename,
      plaintext,
      maxBytes,
    );
  } catch {
    return { kind: "unavailable" };
  } finally {
    plaintext?.fill(0);
  }
}
