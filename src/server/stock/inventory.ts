import { Prisma } from "@/generated/prisma/client";
import {
  DigitalStockStatus,
  StockHealthStatus,
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  decryptSecretBuffer,
  encryptSecret,
  sha256,
} from "@/server/security/crypto";
import { detectStockContent } from "@/server/stock/credential";
import { safeFilename } from "@/server/utils/format";
import { MAX_STOCK_ITEMS_PER_UPLOAD } from "@/lib/stock-upload";

const MAX_STOCK_FILE_BYTES = 64 * 1024;
const STOCK_FILE_BASE64_PREFIX = "telegram-stock-file:v2;base64,";
const STOCK_FILE_BASE64_PREFIX_BUFFER = Buffer.from(
  STOCK_FILE_BASE64_PREFIX,
  "ascii",
);

export type StockImportErrorCode =
  | "stock-product-required"
  | "stock-file-count"
  | "stock-empty"
  | "stock-lines-too-large"
  | "stock-too-large"
  | "stock-product-missing"
  | "stock-invalid-json"
  | "stock-invalid-credential"
  | "stock-encryption-key"
  | "stock-duplicate"
  | "stock-not-editable"
  | "stock-concurrent-update";

export class StockImportError extends Error {
  constructor(
    public readonly code: StockImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StockImportError";
  }
}

type StockFileInput = {
  filename: string;
  content: Buffer;
};

function expandedJsonFilename(filename: string, value: unknown, index: number) {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const identity = value && typeof value === "object" && !Array.isArray(value)
    ? [
        (value as Record<string, unknown>).email,
        (value as Record<string, unknown>).name,
      ].find((item): item is string => typeof item === "string" && item.trim().length > 0)
    : null;
  return identity
    ? `${safeFilename(identity)}.json`
    : `${base}-${String(index + 1).padStart(4, "0")}.json`;
}

export function expandStockFiles(files: StockFileInput[]): StockFileInput[] {
  return files.flatMap((file) => {
    const text = decodeStockText(file.content);
    if (!text) return [file];
    const trimmed = text.trim();
    if (!trimmed) return [file];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          filename: expandedJsonFilename(file.filename, item, index),
          content: Buffer.from(JSON.stringify(item), "utf8"),
        }));
      }
      return [file];
    } catch {
      if (!/\.txt$/i.test(file.filename)) return [file];
      // Plain TXT inventory uses one non-empty credential per line.
    }
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length <= 1) return [file];
    const dot = file.filename.lastIndexOf(".");
    const base = dot > 0 ? file.filename.slice(0, dot) : file.filename;
    return lines.map((line, index) => ({
      filename: `${base}-${String(index + 1).padStart(4, "0")}.txt`,
      content: Buffer.from(line, "utf8"),
    }));
  });
}

export type EditableStockState = {
  status: DigitalStockStatus;
  reservedOrderId: string | null;
  deliveredOrderId: string | null;
  hasOrderItem: boolean;
  hasDeliveryReceipt: boolean;
};

export function canEditStockItem(input: EditableStockState): boolean {
  return (
    (input.status === DigitalStockStatus.AVAILABLE ||
      input.status === DigitalStockStatus.BANNED ||
      input.status === DigitalStockStatus.DISABLED) &&
    !input.reservedOrderId &&
    !input.deliveredOrderId &&
    !input.hasOrderItem &&
    !input.hasDeliveryReceipt
  );
}

function prepareStockFile(productId: string, input: StockFileInput) {
  const size = input.content.byteLength;
  if (size === 0) {
    throw new StockImportError("stock-empty", "Stock file is empty");
  }
  if (size > MAX_STOCK_FILE_BYTES) {
    throw new StockImportError("stock-too-large", "Stock file exceeds 64 KB");
  }

  const textContent = decodeStockText(input.content);
  const parsedStock = textContent
    ? detectStockContent(textContent)
    : {
      kind: "GENERIC" as const,
      credential: null,
      legacyFingerprint: null,
      fingerprint: sha256(
          Buffer.concat([Buffer.from("generic-binary:", "utf8"), input.content]),
        ),
      };

  let encrypted;
  try {
    encrypted = encryptSecret(
      `${STOCK_FILE_BASE64_PREFIX}${input.content.toString("base64")}`,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("DIGITAL_STOCK_ENCRYPTION_KEY")
    ) {
      throw new StockImportError(
        "stock-encryption-key",
        "Digital stock encryption key is invalid",
      );
    }
    throw error;
  }

  return {
    productId,
    originalFilename: safeFilename(input.filename),
    credentialFingerprint: parsedStock.fingerprint,
    legacyCredentialFingerprint: parsedStock.legacyFingerprint,
    healthStatus:
      parsedStock.kind === "GENERIC"
        ? StockHealthStatus.HEALTHY
        : StockHealthStatus.UNKNOWN,
    ...encrypted,
  };
}

async function filterStoredCredentialDuplicates(
  preparedFiles: Array<ReturnType<typeof prepareStockFile>>,
) {
  const currentFingerprints = new Set(
    preparedFiles.map((item) => item.credentialFingerprint),
  );
  const candidateFingerprints = new Set(currentFingerprints);
  for (const item of preparedFiles) {
    if (item.legacyCredentialFingerprint) {
      candidateFingerprints.add(item.legacyCredentialFingerprint);
    }
  }

  const existing = await prisma.digitalStockItem.findMany({
    where: {
      credentialFingerprint: { in: [...candidateFingerprints] },
    },
    select: {
      credentialFingerprint: true,
      encryptedPayload: true,
      encryptionIv: true,
      encryptionTag: true,
    },
  });
  const duplicateFingerprints = new Set<string>();
  for (const item of existing) {
    if (currentFingerprints.has(item.credentialFingerprint)) {
      duplicateFingerprints.add(item.credentialFingerprint);
      continue;
    }

    try {
      const currentIdentity = detectStockContent(decryptStockItem(item)).fingerprint;
      if (currentFingerprints.has(currentIdentity)) {
        duplicateFingerprints.add(currentIdentity);
      }
    } catch (error) {
      if (error instanceof StockImportError) throw error;
      throw new StockImportError(
        "stock-encryption-key",
        "Existing stock could not be checked for duplicates",
      );
    }
  }
  return preparedFiles.filter(
    (item) => !duplicateFingerprints.has(item.credentialFingerprint),
  );
}

export async function importStockFiles(input: {
  productId: string;
  files: StockFileInput[];
}) {
  if (!input.productId) {
    throw new StockImportError("stock-product-required", "Product is required");
  }
  if (input.files.length === 0) {
    throw new StockImportError("stock-file-count", "Upload requires at least one file");
  }

  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });
  if (!product) {
    throw new StockImportError("stock-product-missing", "Product not found");
  }

  const expandedFiles = expandStockFiles(input.files);
  if (expandedFiles.length > MAX_STOCK_ITEMS_PER_UPLOAD) {
    throw new StockImportError(
      "stock-file-count",
      `Upload menghasilkan lebih dari ${MAX_STOCK_ITEMS_PER_UPLOAD} stok`,
    );
  }
  const seenFingerprints = new Set<string>();
  const inputContentBuffers = new Set(input.files.map((file) => file.content));
  let preparedFiles: Array<ReturnType<typeof prepareStockFile>>;
  try {
    preparedFiles = expandedFiles.flatMap((file) => {
      const prepared = prepareStockFile(input.productId, file);
      if (seenFingerprints.has(prepared.credentialFingerprint)) {
        return [];
      }
      seenFingerprints.add(prepared.credentialFingerprint);
      return [prepared];
    });
  } finally {
    for (const file of expandedFiles) {
      if (!inputContentBuffers.has(file.content)) file.content.fill(0);
    }
  }
  const uniquePreparedFiles = await filterStoredCredentialDuplicates(preparedFiles);
  const data = uniquePreparedFiles.map(
    ({ legacyCredentialFingerprint: _legacyCredentialFingerprint, ...item }) =>
      item,
  );
  if (data.length === 0) return [];

  try {
    return await prisma.digitalStockItem.createManyAndReturn({
      data,
      skipDuplicates: true,
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new StockImportError(
        "stock-duplicate",
        "Credential already exists in inventory",
      );
    }
    throw error;
  }
}

export async function updateStockItem(input: {
  stockItemId: string;
  productId: string;
  filename: string;
  content?: Buffer;
}) {
  if (!input.productId) {
    throw new StockImportError("stock-product-required", "Product is required");
  }

  const replacement = input.content
    ? prepareStockFile(input.productId, {
        filename: input.filename,
        content: input.content,
      })
    : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const [product, item] = await Promise.all([
        tx.product.findUnique({
          where: { id: input.productId },
          select: { id: true },
        }),
        tx.digitalStockItem.findUnique({
          where: { id: input.stockItemId },
          select: {
            id: true,
            status: true,
            archivedAt: true,
            updatedAt: true,
            credentialFingerprint: true,
            encryptedPayload: true,
            encryptionIv: true,
            encryptionTag: true,
            reservedOrderId: true,
            deliveredOrderId: true,
            orderItem: { select: { id: true } },
            deliveryReceipt: { select: { id: true } },
          },
        }),
      ]);

      if (!product) {
        throw new StockImportError("stock-product-missing", "Product not found");
      }
      if (!item) {
        throw new StockImportError("stock-not-editable", "Stock item not found");
      }
      if (
        !canEditStockItem({
          status: item.status,
          reservedOrderId: item.reservedOrderId,
          deliveredOrderId: item.deliveredOrderId,
          hasOrderItem: Boolean(item.orderItem),
          hasDeliveryReceipt: Boolean(item.deliveryReceipt),
        })
      ) {
        throw new StockImportError(
          "stock-not-editable",
          "Reserved, sold, or referenced stock cannot be edited",
        );
      }

      const status = item.archivedAt
        ? DigitalStockStatus.DISABLED
        : DigitalStockStatus.AVAILABLE;
      const prepared = replacement
        ? {
            productId: replacement.productId,
            originalFilename: replacement.originalFilename,
            credentialFingerprint: replacement.credentialFingerprint,
            encryptedPayload: replacement.encryptedPayload,
            encryptionIv: replacement.encryptionIv,
            encryptionTag: replacement.encryptionTag,
          }
        : {
            productId: input.productId,
            originalFilename: safeFilename(input.filename),
            credentialFingerprint: item.credentialFingerprint,
            encryptedPayload: item.encryptedPayload,
            encryptionIv: item.encryptionIv,
            encryptionTag: item.encryptionTag,
          };
      const updated = await tx.digitalStockItem.updateMany({
        where: {
          id: item.id,
          status: item.status,
          updatedAt: item.updatedAt,
          reservedOrderId: null,
          deliveredOrderId: null,
        },
        data: {
          ...prepared,
          status,
          healthStatus: StockHealthStatus.UNKNOWN,
          healthHttpStatus: null,
          healthError: null,
          quotaSnapshot: Prisma.DbNull,
          lastCheckedAt: null,
          bannedSaleApprovedAt: null,
          bannedSaleApprovedBy: null,
          bannedSaleApprovalNote: null,
        },
      });
      if (updated.count !== 1) {
        throw new StockImportError(
          "stock-concurrent-update",
          "Stock item changed while editing",
        );
      }

      return {
        id: item.id,
        productId: prepared.productId,
        archived: Boolean(item.archivedAt),
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new StockImportError(
        "stock-duplicate",
        "Credential already exists in inventory",
      );
    }
    throw error;
  }
}

export function decryptStockItem(item: {
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
}): string {
  const plaintext = decryptStockFile(item);
  try {
    return plaintext.toString("utf8");
  } finally {
    plaintext.fill(0);
  }
}

export function decryptStockFile(item: {
  encryptedPayload: string;
  encryptionIv: string;
  encryptionTag: string;
}): Buffer {
  const plaintext = decryptSecretBuffer(item);
  try {
    if (
      plaintext.length >= STOCK_FILE_BASE64_PREFIX_BUFFER.length &&
      plaintext.subarray(0, STOCK_FILE_BASE64_PREFIX_BUFFER.length)
        .equals(STOCK_FILE_BASE64_PREFIX_BUFFER)
    ) {
      return Buffer.from(
        plaintext.subarray(STOCK_FILE_BASE64_PREFIX_BUFFER.length).toString("ascii"),
        "base64",
      );
    }
    return Buffer.from(plaintext);
  } finally {
    plaintext.fill(0);
  }
}

export function decodeStockText(content: Buffer): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}
