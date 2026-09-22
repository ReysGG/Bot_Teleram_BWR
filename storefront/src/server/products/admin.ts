import { z } from "zod";
import { parsePreorderSettings } from "@/server/products/preorder";
import {
  normalizeProductPostDeliveryContent,
  normalizeProductRedeemUrl,
} from "@/server/products/post-delivery";
import {
  normalizeCatalogDescriptionContent,
  normalizeOptionalEnglishCatalogDescriptionContent,
} from "@/server/products/catalog-description";

const productDetailsSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string(),
    price: z.coerce.number().int().positive().max(1_000_000_000),
    imageUrl: z.union([z.string().url().max(2_048), z.literal("")]).optional(),
    groupId: z.preprocess(
      (value) => String(value ?? "").trim() || null,
      z.string().max(100).nullable(),
    ),
    variantLabel: z.preprocess(
      (value) => String(value ?? "").trim() || null,
      z.string().min(2).max(100).nullable(),
    ),
    groupSortOrder: z.preprocess(
      (value) => String(value ?? "").trim() || "0",
      z.coerce.number().int().min(-1_000_000).max(1_000_000),
    ),
  })
  .superRefine((product, context) => {
    if (product.groupId && !product.variantLabel) {
      context.addIssue({
        code: "custom",
        path: ["variantLabel"],
        message: "Nama varian wajib diisi saat produk masuk grup",
      });
    }
  });

export function parseAdminProductInput(input: Record<string, unknown>) {
  const product = productDetailsSchema.parse(input);
  const description = normalizeCatalogDescriptionContent({
    description: product.description,
    entities: input.descriptionEntities,
  });
  const englishDescription = normalizeOptionalEnglishCatalogDescriptionContent({
    description: input.descriptionEn,
    entities: input.descriptionEntitiesEn,
  });
  const postDelivery = normalizeProductPostDeliveryContent({
    instructions: input.postDeliveryInstructions,
    entities: input.postDeliveryEntities,
  });
  return {
    name: product.name,
    ...description,
    ...englishDescription,
    price: product.price,
    imageUrl: product.imageUrl || null,
    groupId: product.groupId,
    variantLabel: product.groupId ? product.variantLabel : null,
    groupSortOrder: product.groupId ? product.groupSortOrder : 0,
    postDeliveryInstructions: postDelivery.instructions,
    postDeliveryEntities: postDelivery.entities,
    redeemUrl: normalizeProductRedeemUrl(input.redeemUrl),
    ...parsePreorderSettings(input),
  };
}

export function parseProductStatus(value: unknown) {
  return z.enum(["ACTIVE", "INACTIVE"]).parse(value);
}
