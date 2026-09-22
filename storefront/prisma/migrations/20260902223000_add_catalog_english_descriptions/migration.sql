BEGIN;

ALTER TABLE "Product"
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "descriptionEntitiesEn" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ProductGroup"
  ADD COLUMN "descriptionEn" TEXT,
  ADD COLUMN "descriptionEntitiesEn" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_descriptionEntitiesEn_array_check"
  CHECK (
    jsonb_typeof("descriptionEntitiesEn") = 'array'
    AND jsonb_array_length("descriptionEntitiesEn") <= 100
  );

COMMIT;

ALTER TABLE "ProductGroup"
  ADD CONSTRAINT "ProductGroup_descriptionEntitiesEn_array_check"
  CHECK (
    jsonb_typeof("descriptionEntitiesEn") = 'array'
    AND jsonb_array_length("descriptionEntitiesEn") <= 100
  );
