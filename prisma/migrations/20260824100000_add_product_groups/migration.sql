BEGIN;

CREATE TABLE "ProductGroup" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "status" "ProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product"
ADD COLUMN "groupId" TEXT,
ADD COLUMN "variantLabel" TEXT,
ADD COLUMN "groupSortOrder" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "OrderItem"
ADD COLUMN "productGroupIdSnapshot" TEXT,
ADD COLUMN "productGroupNameSnapshot" TEXT,
ADD COLUMN "variantLabelSnapshot" TEXT;

CREATE UNIQUE INDEX "ProductGroup_slug_key" ON "ProductGroup"("slug");
CREATE UNIQUE INDEX "ProductGroup_name_ci_key"
ON "ProductGroup"(LOWER(BTRIM("name")));
CREATE INDEX "ProductGroup_status_sortOrder_createdAt_idx"
ON "ProductGroup"("status", "sortOrder", "createdAt");
CREATE INDEX "ProductGroup_createdAt_idx" ON "ProductGroup"("createdAt");
CREATE INDEX "Product_groupId_status_groupSortOrder_createdAt_idx"
ON "Product"("groupId", "status", "groupSortOrder", "createdAt");
CREATE UNIQUE INDEX "Product_group_variant_label_ci_key"
ON "Product"("groupId", LOWER(BTRIM("variantLabel")))
WHERE "groupId" IS NOT NULL AND "variantLabel" IS NOT NULL;
CREATE INDEX "OrderItem_productGroupIdSnapshot_idx"
ON "OrderItem"("productGroupIdSnapshot");

ALTER TABLE "Product"
ADD CONSTRAINT "Product_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "ProductGroup"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
