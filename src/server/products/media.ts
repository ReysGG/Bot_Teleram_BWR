import { createHash } from "node:crypto";
import { appRoute } from "@/server/env";

const MAX_PRODUCT_IMAGE_BYTES = 3 * 1024 * 1024;

const ALLOWED_PRODUCT_IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export class ProductImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductImageError";
  }
}

function hasBytes(content: Buffer, expected: number[], offset = 0) {
  if (content.length < offset + expected.length) return false;
  return expected.every((value, index) => content[offset + index] === value);
}

function detectImageMimeType(content: Buffer): string | null {
  if (hasBytes(content, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (hasBytes(content, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    hasBytes(content, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    hasBytes(content, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    hasBytes(content, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(content, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }
  return null;
}

const STORED_IMAGE_PATTERN =
  /^data:(image\/(?:gif|jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/;

export function decodeStoredProductImage(value: string | null | undefined) {
  if (!value) return null;
  const match = STORED_IMAGE_PATTERN.exec(value);
  if (!match) return null;

  const content = Buffer.from(match[2], "base64");
  if (
    content.length === 0 ||
    content.length > MAX_PRODUCT_IMAGE_BYTES ||
    detectImageMimeType(content) !== match[1]
  ) {
    content.fill(0);
    return null;
  }
  return { contentType: match[1], content };
}

function externalProductImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function telegramCatalogImageUrl(input: {
  kind: "product" | "group";
  id: string;
  imageUrl: string | null | undefined;
}) {
  if (!input.imageUrl) return null;
  if (!isStoredProductImage(input.imageUrl)) {
    return externalProductImageUrl(input.imageUrl);
  }

  const version = createHash("sha256")
    .update(`public-image-v2:${input.imageUrl}`)
    .digest("hex")
    .slice(0, 16);
  const route = input.kind === "product"
    ? `/api/catalog/products/${encodeURIComponent(input.id)}/image?v=${version}`
    : `/api/catalog/product-groups/${encodeURIComponent(input.id)}/image?v=${version}`;
  return appRoute(route).toString();
}

export function telegramProductImageUrl(input: {
  productId: string;
  productImageUrl: string | null | undefined;
  group?: {
    id: string;
    imageUrl: string | null | undefined;
  } | null;
}) {
  if (input.productImageUrl) {
    const productUrl = telegramCatalogImageUrl({
      kind: "product",
      id: input.productId,
      imageUrl: input.productImageUrl,
    });
    if (productUrl) return productUrl;
  }
  if (!input.group?.imageUrl) return null;
  return telegramCatalogImageUrl({
    kind: "group",
    id: input.group.id,
    imageUrl: input.group.imageUrl,
  });
}

export async function prepareProductImage(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ProductImageError("Gambar produk maksimal 3 MB");
  }
  if (!ALLOWED_PRODUCT_IMAGE_TYPES.has(value.type)) {
    throw new ProductImageError("Format gambar produk tidak didukung");
  }

  const content = Buffer.from(await value.arrayBuffer());
  try {
    const detectedMimeType = detectImageMimeType(content);
    if (!detectedMimeType || detectedMimeType !== value.type) {
      throw new ProductImageError("Isi file gambar tidak sesuai formatnya");
    }
    return {
      imageUrl: `data:${detectedMimeType};base64,${content.toString("base64")}`,
    };
  } finally {
    content.fill(0);
  }
}

export function removedProductImage() {
  return { imageUrl: null };
}

export function isStoredProductImage(value: string | null | undefined) {
  return Boolean(value?.startsWith("data:image/"));
}
