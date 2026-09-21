ALTER TYPE "OrderStatus" ADD VALUE 'PAID_WAITING_STOCK';

ALTER TABLE "Product"
ADD COLUMN "preorderEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "preorderEtaText" TEXT,
ADD COLUMN "preorderLimit" INTEGER;

ALTER TABLE "Product"
ADD CONSTRAINT "Product_preorderLimit_check"
CHECK ("preorderLimit" IS NULL OR "preorderLimit" > 0);

ALTER TABLE "Order"
ADD COLUMN "isPreorder" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "preorderEtaText" TEXT,
ADD COLUMN "waitingStockAt" TIMESTAMP(3);

CREATE INDEX "Order_isPreorder_status_paidAt_idx"
ON "Order"("isPreorder", "status", "paidAt");
