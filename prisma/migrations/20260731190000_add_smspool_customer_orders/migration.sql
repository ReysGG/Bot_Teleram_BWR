ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'SMS_PURCHASE_DEBIT';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'SMS_PURCHASE_REFUND';

CREATE TYPE "SmsPoolCustomerOrderStatus" AS ENUM (
  'PROCESSING',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'REFUNDED',
  'FAILED'
);

CREATE TABLE "SmsPoolCustomerOrder" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "buyerUsername" TEXT,
  "buyerDisplayName" TEXT,
  "providerOrderId" TEXT,
  "countryId" INTEGER NOT NULL,
  "countryName" TEXT NOT NULL,
  "countryCode" TEXT,
  "serviceId" INTEGER NOT NULL,
  "serviceName" TEXT NOT NULL,
  "providerCostUsdCents" INTEGER NOT NULL,
  "sellPrice" INTEGER NOT NULL,
  "phoneNumber" TEXT,
  "otpCode" TEXT,
  "fullCode" TEXT,
  "providerStatus" TEXT,
  "status" "SmsPoolCustomerOrderStatus" NOT NULL DEFAULT 'PROCESSING',
  "expiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "refundedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmsPoolCustomerOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SmsPoolCustomerOrder_idempotencyKey_key" ON "SmsPoolCustomerOrder"("idempotencyKey");
CREATE UNIQUE INDEX "SmsPoolCustomerOrder_providerOrderId_key" ON "SmsPoolCustomerOrder"("providerOrderId");
CREATE INDEX "SmsPoolCustomerOrder_chatId_createdAt_idx" ON "SmsPoolCustomerOrder"("chatId", "createdAt");
CREATE INDEX "SmsPoolCustomerOrder_status_expiresAt_idx" ON "SmsPoolCustomerOrder"("status", "expiresAt");
CREATE INDEX "SmsPoolCustomerOrder_buyerUsername_createdAt_idx" ON "SmsPoolCustomerOrder"("buyerUsername", "createdAt");

ALTER TABLE "SmsPoolCustomerOrder"
  ADD CONSTRAINT "SmsPoolCustomerOrder_chatId_fkey"
  FOREIGN KEY ("chatId") REFERENCES "Wallet"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;
