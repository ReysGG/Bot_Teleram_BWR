ALTER TYPE "BotSessionState" ADD VALUE 'AWAITING_BINANCE_ORDER_ID';

ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "binanceInternalEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "binanceInternalRecipientId" TEXT,
  ADD COLUMN "binanceInternalUpdatedBy" TEXT,
  ADD COLUMN "binanceInternalUpdatedAt" TIMESTAMP(3),
  ADD CONSTRAINT "StoreRuntimeSetting_binanceInternalRecipientId_check"
    CHECK ("binanceInternalRecipientId" IS NULL OR "binanceInternalRecipientId" ~ '^[0-9]{5,32}$');

CREATE TYPE "BinanceInternalPaymentStatus" AS ENUM ('AWAITING_ORDER_ID', 'VERIFYING', 'VERIFIED', 'CONFIRMED', 'REJECTED', 'EXPIRED');
CREATE TABLE "BinanceInternalPaymentAttempt" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "rateSnapshot" INTEGER NOT NULL,
  "baseUsdtMicros" BIGINT NOT NULL, "uniqueMicros" INTEGER NOT NULL,
  "expectedUsdtMicros" BIGINT NOT NULL, "recipientBinanceIdSnapshot" TEXT NOT NULL,
  "status" "BinanceInternalPaymentStatus" NOT NULL DEFAULT 'AWAITING_ORDER_ID',
  "submittedOrderId" TEXT, "canonicalTransactionId" TEXT,
  "observedAmount" DECIMAL(36,18), "observedCurrency" TEXT,
  "observedOrderType" TEXT, "observedProviderStatus" TEXT, "observedWalletTypes" JSONB,
  "observedPayerName" TEXT, "observedReceiverBinanceId" TEXT, "observedReceiverName" TEXT,
  "observedTransactionTime" TIMESTAMP(3), "submittedAt" TIMESTAMP(3), "lastCheckedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3), "failureReason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL, "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BinanceInternalPaymentAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BinanceInternalPaymentAttempt_rateSnapshot_check" CHECK ("rateSnapshot" BETWEEN 5000 AND 100000),
  CONSTRAINT "BinanceInternalPaymentAttempt_baseUsdtMicros_check" CHECK ("baseUsdtMicros" > 0),
  CONSTRAINT "BinanceInternalPaymentAttempt_uniqueMicros_check" CHECK ("uniqueMicros" BETWEEN 1 AND 999),
  CONSTRAINT "BinanceInternalPaymentAttempt_expectedUsdtMicros_check" CHECK ("expectedUsdtMicros" = "baseUsdtMicros" + "uniqueMicros"),
  CONSTRAINT "BinanceInternalPaymentAttempt_recipientBinanceIdSnapshot_check" CHECK ("recipientBinanceIdSnapshot" ~ '^[0-9]{5,32}$'),
  CONSTRAINT "BinanceInternalPaymentAttempt_submittedOrderId_check" CHECK ("submittedOrderId" IS NULL OR "submittedOrderId" ~ '^[A-Za-z0-9_-]{6,128}$'),
  CONSTRAINT "BinanceInternalPaymentAttempt_canonicalTransactionId_check" CHECK ("canonicalTransactionId" IS NULL OR "canonicalTransactionId" ~ '^[A-Za-z0-9_-]{6,148}$')
);
CREATE UNIQUE INDEX "BinanceInternalPaymentAttempt_orderId_key" ON "BinanceInternalPaymentAttempt"("orderId");
CREATE UNIQUE INDEX "BinanceInternalPaymentAttempt_submittedOrderId_key" ON "BinanceInternalPaymentAttempt"("submittedOrderId");
CREATE UNIQUE INDEX "BinanceInternalPaymentAttempt_canonicalTransactionId_key" ON "BinanceInternalPaymentAttempt"("canonicalTransactionId");
CREATE UNIQUE INDEX "BinanceInternalPaymentAttempt_active_expectedUsdtMicros_key" ON "BinanceInternalPaymentAttempt"("expectedUsdtMicros") WHERE "status" IN ('AWAITING_ORDER_ID', 'VERIFYING', 'VERIFIED');
CREATE INDEX "BinanceInternalPaymentAttempt_status_lastCheckedAt_idx" ON "BinanceInternalPaymentAttempt"("status", "lastCheckedAt");
CREATE INDEX "BinanceInternalPaymentAttempt_status_expiresAt_idx" ON "BinanceInternalPaymentAttempt"("status", "expiresAt");
CREATE INDEX "BinanceInternalPaymentAttempt_status_verificationExpiresAt_idx" ON "BinanceInternalPaymentAttempt"("status", "verificationExpiresAt");
CREATE INDEX "BinanceInternalPaymentAttempt_expectedUsdtMicros_status_idx" ON "BinanceInternalPaymentAttempt"("expectedUsdtMicros", "status");
CREATE INDEX "BinanceInternalPaymentAttempt_createdAt_idx" ON "BinanceInternalPaymentAttempt"("createdAt");
ALTER TABLE "BinanceInternalPaymentAttempt" ADD CONSTRAINT "BinanceInternalPaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_binance_internal_payment_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."rateSnapshot" IS DISTINCT FROM OLD."rateSnapshot"
     OR NEW."baseUsdtMicros" IS DISTINCT FROM OLD."baseUsdtMicros" OR NEW."uniqueMicros" IS DISTINCT FROM OLD."uniqueMicros"
     OR NEW."expectedUsdtMicros" IS DISTINCT FROM OLD."expectedUsdtMicros"
     OR NEW."recipientBinanceIdSnapshot" IS DISTINCT FROM OLD."recipientBinanceIdSnapshot"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR NEW."verificationExpiresAt" IS DISTINCT FROM OLD."verificationExpiresAt" THEN
    RAISE EXCEPTION 'Binance internal payment snapshots are immutable';
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "BinanceInternalPaymentAttempt_protect_snapshots" BEFORE UPDATE ON "BinanceInternalPaymentAttempt" FOR EACH ROW EXECUTE FUNCTION "protect_binance_internal_payment_snapshots"();
