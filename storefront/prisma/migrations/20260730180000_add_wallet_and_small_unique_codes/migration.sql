ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';

CREATE TYPE "WalletTopupStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'FAILED');
CREATE TYPE "WalletTransactionType" AS ENUM (
  'TOPUP_CREDIT',
  'ADMIN_CREDIT',
  'ADMIN_DEBIT',
  'PURCHASE_DEBIT',
  'DELIVERY_REFUND'
);

ALTER TABLE "Order"
ADD COLUMN "refundedAt" TIMESTAMP(3);

ALTER TABLE "Payment"
ADD COLUMN "uniqueCode" INTEGER;

UPDATE "Payment" AS payment
SET "uniqueCode" = orders."serviceFee"
FROM "Order" AS orders
WHERE orders."id" = payment."orderId";

CREATE TABLE "Wallet" (
  "chatId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0,
  "buyerUsername" TEXT,
  "buyerDisplayName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Wallet_pkey" PRIMARY KEY ("chatId"),
  CONSTRAINT "Wallet_balance_nonnegative" CHECK ("balance" >= 0)
);

CREATE TABLE "WalletTopup" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "baseAmount" INTEGER NOT NULL,
  "uniqueCode" INTEGER NOT NULL,
  "billedAmount" INTEGER NOT NULL,
  "status" "WalletTopupStatus" NOT NULL DEFAULT 'PENDING',
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "telegramInvoiceMessageId" INTEGER,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletTopup_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletTopup_baseAmount_positive" CHECK ("baseAmount" > 0),
  CONSTRAINT "WalletTopup_uniqueCode_range" CHECK ("uniqueCode" BETWEEN 1 AND 99),
  CONSTRAINT "WalletTopup_billedAmount_valid" CHECK ("billedAmount" = "baseAmount" + "uniqueCode")
);

CREATE TABLE "WalletTransaction" (
  "id" TEXT NOT NULL,
  "walletChatId" TEXT NOT NULL,
  "type" "WalletTransactionType" NOT NULL,
  "amount" INTEGER NOT NULL,
  "balanceBefore" INTEGER NOT NULL,
  "balanceAfter" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "orderId" TEXT,
  "walletTopupId" TEXT,
  "note" TEXT,
  "actor" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletTransaction_amount_nonzero" CHECK ("amount" <> 0),
  CONSTRAINT "WalletTransaction_balance_nonnegative" CHECK (
    "balanceBefore" >= 0 AND "balanceAfter" >= 0
  ),
  CONSTRAINT "WalletTransaction_balance_math" CHECK (
    "balanceAfter" = "balanceBefore" + "amount"
  )
);

ALTER TABLE "BridgePaymentClaim"
ALTER COLUMN "orderId" DROP NOT NULL,
ADD COLUMN "walletTopupId" TEXT;

ALTER TABLE "BridgePaymentEvent"
ADD COLUMN "walletTopupId" TEXT;

ALTER TABLE "TelegramNotification"
ADD COLUMN "walletTopupId" TEXT;

CREATE UNIQUE INDEX "WalletTopup_idempotencyKey_key" ON "WalletTopup"("idempotencyKey");
CREATE UNIQUE INDEX "WalletTopup_invoiceNumber_key" ON "WalletTopup"("invoiceNumber");
CREATE INDEX "WalletTopup_chatId_createdAt_idx" ON "WalletTopup"("chatId", "createdAt");
CREATE INDEX "WalletTopup_status_uniqueCode_expiresAt_idx" ON "WalletTopup"("status", "uniqueCode", "expiresAt");
CREATE INDEX "WalletTopup_status_billedAmount_expiresAt_idx" ON "WalletTopup"("status", "billedAmount", "expiresAt");

CREATE UNIQUE INDEX "WalletTransaction_idempotencyKey_key" ON "WalletTransaction"("idempotencyKey");
CREATE INDEX "WalletTransaction_walletChatId_createdAt_idx" ON "WalletTransaction"("walletChatId", "createdAt");
CREATE INDEX "WalletTransaction_orderId_idx" ON "WalletTransaction"("orderId");
CREATE INDEX "WalletTransaction_walletTopupId_idx" ON "WalletTransaction"("walletTopupId");
CREATE INDEX "WalletTransaction_type_createdAt_idx" ON "WalletTransaction"("type", "createdAt");

CREATE INDEX "Wallet_balance_updatedAt_idx" ON "Wallet"("balance", "updatedAt");
CREATE INDEX "Wallet_buyerUsername_idx" ON "Wallet"("buyerUsername");

CREATE UNIQUE INDEX "BridgePaymentClaim_walletTopupId_key" ON "BridgePaymentClaim"("walletTopupId");
CREATE INDEX "BridgePaymentEvent_walletTopupId_idx" ON "BridgePaymentEvent"("walletTopupId");
CREATE INDEX "TelegramNotification_walletTopupId_idx" ON "TelegramNotification"("walletTopupId");

ALTER TABLE "WalletTopup"
ADD CONSTRAINT "WalletTopup_chatId_fkey"
FOREIGN KEY ("chatId") REFERENCES "Wallet"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_walletChatId_fkey"
FOREIGN KEY ("walletChatId") REFERENCES "Wallet"("chatId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WalletTransaction"
ADD CONSTRAINT "WalletTransaction_walletTopupId_fkey"
FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BridgePaymentClaim"
ADD CONSTRAINT "BridgePaymentClaim_walletTopupId_fkey"
FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BridgePaymentEvent"
ADD CONSTRAINT "BridgePaymentEvent_walletTopupId_fkey"
FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramNotification"
ADD CONSTRAINT "TelegramNotification_walletTopupId_fkey"
FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BridgePaymentClaim"
ADD CONSTRAINT "BridgePaymentClaim_exactly_one_target" CHECK (
  (("orderId" IS NOT NULL)::integer + ("walletTopupId" IS NOT NULL)::integer) = 1
);
