ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'PAYMENT_RELEASE_REFUND';

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Product_createdAt_idx" ON "Product"("createdAt");
CREATE INDEX "DigitalStockItem_productId_createdAt_idx" ON "DigitalStockItem"("productId", "createdAt");
CREATE INDEX "DigitalStockItem_archivedAt_status_createdAt_idx" ON "DigitalStockItem"("archivedAt", "status", "createdAt");
CREATE INDEX "Wallet_updatedAt_idx" ON "Wallet"("updatedAt");
CREATE INDEX "WalletTopup_createdAt_idx" ON "WalletTopup"("createdAt");

CREATE INDEX "Product_name_trgm_idx" ON "Product" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Product_slug_trgm_idx" ON "Product" USING GIN ("slug" gin_trgm_ops);
CREATE INDEX "Product_description_trgm_idx" ON "Product" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "Product_attachmentOriginalFilename_trgm_idx" ON "Product" USING GIN ("attachmentOriginalFilename" gin_trgm_ops);
CREATE INDEX "DigitalStockItem_originalFilename_trgm_idx" ON "DigitalStockItem" USING GIN ("originalFilename" gin_trgm_ops);
CREATE INDEX "DigitalStockItem_credentialFingerprint_trgm_idx" ON "DigitalStockItem" USING GIN ("credentialFingerprint" gin_trgm_ops);
CREATE INDEX "Wallet_buyerUsername_trgm_idx" ON "Wallet" USING GIN ("buyerUsername" gin_trgm_ops);
CREATE INDEX "Wallet_buyerDisplayName_trgm_idx" ON "Wallet" USING GIN ("buyerDisplayName" gin_trgm_ops);
CREATE INDEX "Wallet_chatId_trgm_idx" ON "Wallet" USING GIN ("chatId" gin_trgm_ops);
CREATE INDEX "WalletTopup_invoiceNumber_trgm_idx" ON "WalletTopup" USING GIN ("invoiceNumber" gin_trgm_ops);
CREATE INDEX "WalletTopup_chatId_trgm_idx" ON "WalletTopup" USING GIN ("chatId" gin_trgm_ops);
CREATE INDEX "WalletTransaction_note_trgm_idx" ON "WalletTransaction" USING GIN ("note" gin_trgm_ops);
CREATE INDEX "WalletTransaction_actor_trgm_idx" ON "WalletTransaction" USING GIN ("actor" gin_trgm_ops);
