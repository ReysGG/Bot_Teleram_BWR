BEGIN;

ALTER TABLE "Product"
  ADD COLUMN "descriptionEntities" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "ProductGroup"
  ADD COLUMN "descriptionEntities" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_descriptionEntities_array_check"
    CHECK (
      jsonb_typeof("descriptionEntities") = 'array'
      AND jsonb_array_length("descriptionEntities") <= 100
    );

ALTER TABLE "ProductGroup"
  ADD CONSTRAINT "ProductGroup_descriptionEntities_array_check"
    CHECK (
      jsonb_typeof("descriptionEntities") = 'array'
      AND jsonb_array_length("descriptionEntities") <= 100
    );

COMMIT;
