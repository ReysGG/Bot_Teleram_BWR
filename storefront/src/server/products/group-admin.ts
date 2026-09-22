import { z } from "zod";
import {
  normalizeCatalogDescriptionContent,
  normalizeOptionalEnglishCatalogDescriptionContent,
} from "@/server/products/catalog-description";

const productGroupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string(),
  imageUrl: z.union([z.string().url(), z.literal("")]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  sortOrder: z.coerce.number().int().min(-1_000_000).max(1_000_000).default(0),
});

export function parseAdminProductGroupInput(input: Record<string, unknown>) {
  const group = productGroupSchema.parse(input);
  const description = normalizeCatalogDescriptionContent({
    description: group.description,
    entities: input.descriptionEntities,
  });
  const englishDescription = normalizeOptionalEnglishCatalogDescriptionContent({
    description: input.descriptionEn,
    entities: input.descriptionEntitiesEn,
  });
  return {
    name: group.name,
    ...description,
    ...englishDescription,
    imageUrl: group.imageUrl || null,
    status: group.status,
    sortOrder: group.sortOrder,
  };
}

export function productGroupRemovalMode(productCount: number) {
  return productCount > 0 ? "PROTECTED" as const : "DELETE" as const;
}
