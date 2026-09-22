import { decryptSecretBuffer, encryptSecret } from "@/server/security/crypto";
import { safeFilename } from "@/server/utils/format";

const MAX_PRODUCT_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const PRODUCT_ATTACHMENT_PREFIX = "telegram-product-attachment:v1;base64,";
const PRODUCT_ATTACHMENT_PREFIX_BUFFER = Buffer.from(
  PRODUCT_ATTACHMENT_PREFIX,
  "ascii",
);

export class ProductAttachmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductAttachmentError";
  }
}

export async function prepareProductAttachment(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_PRODUCT_ATTACHMENT_BYTES) {
    throw new ProductAttachmentError("Lampiran produk maksimal 8 MB");
  }
  const content = Buffer.from(await value.arrayBuffer());
  try {
    const encrypted = encryptSecret(
      `${PRODUCT_ATTACHMENT_PREFIX}${content.toString("base64")}`,
    );
    return {
      attachmentOriginalFilename: safeFilename(value.name),
      attachmentMimeType: value.type.trim().slice(0, 120) || "application/octet-stream",
      attachmentEncryptedPayload: encrypted.encryptedPayload,
      attachmentEncryptionIv: encrypted.encryptionIv,
      attachmentEncryptionTag: encrypted.encryptionTag,
      attachmentUpdatedAt: new Date(),
    };
  } finally {
    content.fill(0);
  }
}

export function removedProductAttachment() {
  return {
    attachmentOriginalFilename: null,
    attachmentMimeType: null,
    attachmentEncryptedPayload: null,
    attachmentEncryptionIv: null,
    attachmentEncryptionTag: null,
    attachmentUpdatedAt: null,
  };
}

export function decryptProductAttachment(product: {
  attachmentEncryptedPayload: string;
  attachmentEncryptionIv: string;
  attachmentEncryptionTag: string;
}) {
  const plaintext = decryptSecretBuffer({
    encryptedPayload: product.attachmentEncryptedPayload,
    encryptionIv: product.attachmentEncryptionIv,
    encryptionTag: product.attachmentEncryptionTag,
  });
  try {
    if (
      plaintext.length < PRODUCT_ATTACHMENT_PREFIX_BUFFER.length ||
      !plaintext.subarray(0, PRODUCT_ATTACHMENT_PREFIX_BUFFER.length)
        .equals(PRODUCT_ATTACHMENT_PREFIX_BUFFER)
    ) {
      throw new ProductAttachmentError("Format lampiran produk tidak valid");
    }
    return Buffer.from(
      plaintext.subarray(PRODUCT_ATTACHMENT_PREFIX_BUFFER.length).toString("ascii"),
      "base64",
    );
  } finally {
    plaintext.fill(0);
  }
}
