import {
  buildCombinedTextInventory,
  combinedTextFilename,
} from "@/server/stock/text-export";
import {
  buildNineRouterBulkImport,
  nineRouterBulkFilename,
} from "@/server/stock/nine-router-export";
import type { CredentialJson } from "@/server/stock/credential";
import { createZipArchive } from "@/server/files/zip";

export const MAX_DIGITAL_DELIVERY_CHUNK_ITEMS = 100;
export const MAX_DIGITAL_DELIVERY_CHUNK_BYTES = 20 * 1024 * 1024;

export function digitalDeliveryClaimTake() {
  return MAX_DIGITAL_DELIVERY_CHUNK_ITEMS;
}

export type DeliveryBundleFormat = "K12" | "TEXT" | "ZIP";

export type DeliveryBundleContentItem = {
  filename: string;
  fileContent: Buffer;
  credential: CredentialJson | null;
  textContent: string | null;
};

export function deliveryBundleFormatFor(
  items: ReadonlyArray<{ credential: unknown | null; textContent: string | null }>,
): DeliveryBundleFormat {
  if (items.every((item) => item.credential !== null)) return "K12";
  if (items.every((item) => item.textContent !== null)) return "TEXT";
  return "ZIP";
}

export function buildDeliveryBundleContent(
  format: DeliveryBundleFormat,
  items: readonly DeliveryBundleContentItem[],
) {
  if (format === "K12") {
    return buildNineRouterBulkImport(items.map((item) => item.credential!));
  }
  if (format === "TEXT") {
    return buildCombinedTextInventory(items.map((item) => item.textContent!));
  }
  return createZipArchive(
    items.map((item) => ({
      filename: item.filename,
      content: item.fileContent,
    })),
  );
}

export type DeliveryBundleChunk<T> = {
  items: T[];
  content: Buffer;
};

type DeliveryChunkLimits = {
  maxItems?: number;
  maxBytes?: number;
};

function normalizePositiveLimit(value: number | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError("Delivery chunk limits must be positive integers.");
  }
  return value;
}

/**
 * Render first, then bisect oversized batches. This guarantees the byte limit
 * against the actual JSON/TXT/ZIP output instead of an unreliable estimate.
 */
export function buildBoundedDeliveryChunks<T>(
  items: readonly T[],
  buildContent: (items: readonly T[]) => Buffer,
  limits: DeliveryChunkLimits = {},
): DeliveryBundleChunk<T>[] {
  const maxItems = normalizePositiveLimit(
    limits.maxItems,
    MAX_DIGITAL_DELIVERY_CHUNK_ITEMS,
  );
  const maxBytes = normalizePositiveLimit(
    limits.maxBytes,
    MAX_DIGITAL_DELIVERY_CHUNK_BYTES,
  );

  const splitRenderedBatch = (batch: readonly T[]): DeliveryBundleChunk<T>[] => {
    const content = buildContent(batch);
    if (content.byteLength <= maxBytes) {
      return [{ items: [...batch], content }];
    }
    if (batch.length <= 1) {
      throw new RangeError("One digital stock item exceeds the delivery chunk limit.");
    }

    const midpoint = Math.ceil(batch.length / 2);
    return [
      ...splitRenderedBatch(batch.slice(0, midpoint)),
      ...splitRenderedBatch(batch.slice(midpoint)),
    ];
  };

  const chunks: DeliveryBundleChunk<T>[] = [];
  for (let offset = 0; offset < items.length; offset += maxItems) {
    chunks.push(...splitRenderedBatch(items.slice(offset, offset + maxItems)));
  }
  return chunks;
}

function safeInvoiceNumber(invoiceNumber: string) {
  return invoiceNumber
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "order";
}

export function deliveryBundleFilename(input: {
  invoiceNumber: string;
  format: DeliveryBundleFormat;
  quantity: number;
  unitStart: number;
  unitEnd: number;
  totalUnits: number;
}) {
  const wholeOrder =
    input.unitStart === 1 &&
    input.unitEnd === input.totalUnits &&
    input.quantity === input.totalUnits;
  if (wholeOrder && input.format === "K12") {
    return nineRouterBulkFilename(input.invoiceNumber, input.quantity);
  }
  if (wholeOrder && input.format === "TEXT") {
    return combinedTextFilename(input.invoiceNumber, input.quantity);
  }

  const width = Math.max(4, String(Math.max(1, input.totalUnits)).length);
  const range = `${String(input.unitStart).padStart(width, "0")}-${String(
    input.unitEnd,
  ).padStart(width, "0")}-of-${String(input.totalUnits).padStart(width, "0")}`;
  const prefix = safeInvoiceNumber(input.invoiceNumber);
  if (input.format === "K12") {
    return `${prefix}-${range}-accounts.9router.json`;
  }
  if (input.format === "TEXT") {
    return `${prefix}-${range}-items.txt`;
  }
  return `${prefix}-${range}-files.zip`;
}
