BEGIN;

ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "legacyQrisFallbackEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "legacyQrisFallbackUpdatedBy" TEXT,
  ADD COLUMN "legacyQrisFallbackUpdatedAt" TIMESTAMP(3);

-- Existing active vault merchants must not reveal the legacy env fallback
-- later merely because they are archived after this migration.
INSERT INTO "StoreRuntimeSetting" (
  "id",
  "legacyQrisFallbackEnabled",
  "legacyQrisFallbackUpdatedBy",
  "legacyQrisFallbackUpdatedAt",
  "updatedAt"
)
SELECT
  'global',
  false,
  'migration:20260823141000',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM "QrisMerchant"
  WHERE "isActive" = true
    AND "enabled" = true
    AND "archivedAt" IS NULL
)
ON CONFLICT ("id") DO UPDATE SET
  "legacyQrisFallbackEnabled" = false,
  "legacyQrisFallbackUpdatedBy" = EXCLUDED."legacyQrisFallbackUpdatedBy",
  "legacyQrisFallbackUpdatedAt" = EXCLUDED."legacyQrisFallbackUpdatedAt",
  "updatedAt" = EXCLUDED."updatedAt";

COMMIT;
