BEGIN;
CREATE TABLE "WebCart" (
  "webCustomerId" TEXT PRIMARY KEY,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("webCustomerId") REFERENCES "WebCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "WebCartItem" (
  "id" TEXT PRIMARY KEY,
  "webCustomerId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 750),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("webCustomerId") REFERENCES "WebCart"("webCustomerId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WebCartItem_webCustomerId_productId_key" ON "WebCartItem"("webCustomerId", "productId");
CREATE INDEX "WebCartItem_productId_idx" ON "WebCartItem"("productId");
CREATE TABLE "WebCartMutation" (
  "webCustomerId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("webCustomerId", "idempotencyKey"),
  FOREIGN KEY ("webCustomerId") REFERENCES "WebCart"("webCustomerId") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "WebCartMutation_webCustomerId_createdAt_idx" ON "WebCartMutation"("webCustomerId", "createdAt");
COMMIT;
