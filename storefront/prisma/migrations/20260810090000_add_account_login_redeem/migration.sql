ALTER TYPE "BotSessionState" ADD VALUE IF NOT EXISTS 'AWAITING_REDEEM_UPLOAD';

CREATE TYPE "AccountRedeemBatchStatus" AS ENUM ('PROCESSING', 'SENT', 'FAILED', 'UNKNOWN');

CREATE TABLE "AccountLoginCredential" (
  "id" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "emailMasked" TEXT NOT NULL,
  "contentFingerprint" TEXT NOT NULL,
  "encryptedPayload" TEXT NOT NULL,
  "encryptionIv" TEXT NOT NULL,
  "encryptionTag" TEXT NOT NULL,
  "sourceFilename" TEXT NOT NULL,
  "importedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountLoginCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountRedeemBatch" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "inputCount" INTEGER NOT NULL,
  "matchedCount" INTEGER NOT NULL,
  "unmatchedCount" INTEGER NOT NULL,
  "invalidCount" INTEGER NOT NULL,
  "status" "AccountRedeemBatchStatus" NOT NULL DEFAULT 'PROCESSING',
  "telegramMessageId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountRedeemBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AccountRedeemEvent" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "stockItemId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "loginCredentialId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountRedeemEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountLoginCredential_emailHash_key" ON "AccountLoginCredential"("emailHash");
CREATE UNIQUE INDEX "AccountLoginCredential_tokenHash_key" ON "AccountLoginCredential"("tokenHash");
CREATE INDEX "AccountLoginCredential_updatedAt_idx" ON "AccountLoginCredential"("updatedAt");
CREATE INDEX "AccountRedeemBatch_chatId_createdAt_idx" ON "AccountRedeemBatch"("chatId", "createdAt");
CREATE INDEX "AccountRedeemBatch_status_createdAt_idx" ON "AccountRedeemBatch"("status", "createdAt");
CREATE UNIQUE INDEX "AccountRedeemEvent_batchId_stockItemId_key" ON "AccountRedeemEvent"("batchId", "stockItemId");
CREATE INDEX "AccountRedeemEvent_chatId_createdAt_idx" ON "AccountRedeemEvent"("chatId", "createdAt");
CREATE INDEX "AccountRedeemEvent_stockItemId_createdAt_idx" ON "AccountRedeemEvent"("stockItemId", "createdAt");
CREATE INDEX "AccountRedeemEvent_orderId_idx" ON "AccountRedeemEvent"("orderId");
CREATE INDEX "AccountRedeemEvent_loginCredentialId_createdAt_idx" ON "AccountRedeemEvent"("loginCredentialId", "createdAt");

ALTER TABLE "AccountRedeemEvent"
  ADD CONSTRAINT "AccountRedeemEvent_batchId_fkey"
  FOREIGN KEY ("batchId") REFERENCES "AccountRedeemBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountRedeemEvent"
  ADD CONSTRAINT "AccountRedeemEvent_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "DigitalStockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountRedeemEvent"
  ADD CONSTRAINT "AccountRedeemEvent_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AccountRedeemEvent"
  ADD CONSTRAINT "AccountRedeemEvent_loginCredentialId_fkey"
  FOREIGN KEY ("loginCredentialId") REFERENCES "AccountLoginCredential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
