UPDATE "DigitalStockItem"
SET "archivedAt" = NULL
WHERE "status" = 'DELIVERED'
  AND "archivedAt" IS NOT NULL;
