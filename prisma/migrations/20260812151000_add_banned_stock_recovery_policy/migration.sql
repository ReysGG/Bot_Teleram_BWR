CREATE TYPE "BannedStockPolicy" AS ENUM ('BLOCKED', 'OWNER_APPROVAL', 'RELOGIN_REQUIRED');

ALTER TABLE "Product"
ADD COLUMN "bannedStockPolicy" "BannedStockPolicy" NOT NULL DEFAULT 'BLOCKED';

ALTER TABLE "DigitalStockItem"
ADD COLUMN "bannedSaleApprovedAt" TIMESTAMP(3),
ADD COLUMN "bannedSaleApprovedBy" TEXT,
ADD COLUMN "bannedSaleApprovalNote" TEXT;

-- Existing Codex Free credentials must be repaired and checked healthy before sale.
UPDATE "Product"
SET "bannedStockPolicy" = 'RELOGIN_REQUIRED'
WHERE (
  lower(slug) LIKE '%codex%free%'
  OR lower(name) LIKE '%codex%free%'
);

-- K12 JSON can only be sold while banned after an explicit per-stock owner approval.
UPDATE "Product"
SET "bannedStockPolicy" = 'OWNER_APPROVAL'
WHERE (
  lower(slug) LIKE '%k12%'
  OR lower(name) LIKE '%k12%'
)
AND (
  lower(slug) LIKE '%json%'
  OR lower(name) LIKE '%json%'
);

CREATE INDEX "Product_bannedStockPolicy_status_idx"
ON "Product"("bannedStockPolicy", "status");

CREATE INDEX "DigitalStockItem_productId_healthStatus_bannedSaleApprovedAt_idx"
ON "DigitalStockItem"("productId", "healthStatus", "bannedSaleApprovedAt");
