ALTER TABLE "BotSession"
ADD COLUMN "buyerUsername" TEXT,
ADD COLUMN "buyerDisplayName" TEXT,
ADD COLUMN "broadcastEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "Order"
ADD COLUMN "buyerUsername" TEXT,
ADD COLUMN "buyerDisplayName" TEXT,
ALTER COLUMN "buyerEmail" DROP NOT NULL;

CREATE INDEX "Order_buyerUsername_createdAt_idx"
ON "Order"("buyerUsername", "createdAt");

ALTER TABLE "Payment"
ADD COLUMN "telegramInvoiceMessageId" INTEGER;

ALTER TABLE "TelegramNotification"
ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "productId" TEXT;

CREATE INDEX "TelegramNotification_status_priority_nextAttemptAt_idx"
ON "TelegramNotification"("status", "priority", "nextAttemptAt");

CREATE INDEX "TelegramNotification_productId_idx"
ON "TelegramNotification"("productId");

ALTER TABLE "TelegramNotification"
ADD CONSTRAINT "TelegramNotification_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
