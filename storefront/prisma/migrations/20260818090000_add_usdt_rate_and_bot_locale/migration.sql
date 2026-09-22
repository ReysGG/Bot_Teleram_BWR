ALTER TABLE "BotSession"
  ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'id',
  ADD CONSTRAINT "BotSession_locale_check"
    CHECK ("locale" IN ('id', 'en'));

ALTER TYPE "BotSessionState" ADD VALUE 'AWAITING_USDT_TX_HASH';

ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "usdtIdrRate" INTEGER NOT NULL DEFAULT 18500,
  ADD COLUMN "usdtIdrRateSource" TEXT NOT NULL DEFAULT 'ADMIN_MANUAL',
  ADD COLUMN "usdtIdrRateUpdatedBy" TEXT,
  ADD COLUMN "usdtIdrRateUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "usdtBep20Enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "usdtBep20RecipientAddress" TEXT,
  ADD COLUMN "usdtBep20TokenContract" TEXT NOT NULL DEFAULT '0x55d398326f99059ff775485246999027b3197955',
  ADD COLUMN "usdtBep20TokenDecimals" INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN "usdtBep20RequiredConfirmations" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "usdtBep20UpdatedBy" TEXT,
  ADD COLUMN "usdtBep20UpdatedAt" TIMESTAMP(3),
  ADD CONSTRAINT "StoreRuntimeSetting_usdtIdrRate_check" CHECK ("usdtIdrRate" BETWEEN 5000 AND 100000),
  ADD CONSTRAINT "StoreRuntimeSetting_usdtBep20RecipientAddress_check" CHECK ("usdtBep20RecipientAddress" IS NULL OR "usdtBep20RecipientAddress" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "StoreRuntimeSetting_usdtBep20TokenContract_check" CHECK ("usdtBep20TokenContract" ~ '^0x[0-9a-f]{40}$'),
  ADD CONSTRAINT "StoreRuntimeSetting_usdtBep20TokenDecimals_check" CHECK ("usdtBep20TokenDecimals" BETWEEN 6 AND 30),
  ADD CONSTRAINT "StoreRuntimeSetting_usdtBep20RequiredConfirmations_check" CHECK ("usdtBep20RequiredConfirmations" BETWEEN 1 AND 100);

CREATE TYPE "UsdtBep20AttemptStatus" AS ENUM ('AWAITING_TX_HASH', 'VERIFYING', 'PENDING_CONFIRMATIONS', 'VERIFIED', 'CONFIRMED', 'REJECTED', 'EXPIRED');

CREATE TABLE "UsdtBep20Attempt" (
  "id" TEXT NOT NULL, "orderId" TEXT NOT NULL, "rateSnapshot" INTEGER NOT NULL,
  "baseUsdtMicros" BIGINT NOT NULL, "uniqueMicros" INTEGER NOT NULL,
  "expectedUsdtMicros" BIGINT NOT NULL, "expectedTokenUnits" DECIMAL(78,0) NOT NULL,
  "recipientAddressSnapshot" TEXT NOT NULL, "tokenContractSnapshot" TEXT NOT NULL,
  "tokenDecimalsSnapshot" INTEGER NOT NULL, "chainIdSnapshot" INTEGER NOT NULL DEFAULT 56,
  "requiredConfirmationsSnapshot" INTEGER NOT NULL,
  "status" "UsdtBep20AttemptStatus" NOT NULL DEFAULT 'AWAITING_TX_HASH',
  "txHash" TEXT, "transferLogIndex" INTEGER, "blockNumber" BIGINT,
  "blockTimestamp" TIMESTAMP(3), "confirmations" INTEGER, "submittedAt" TIMESTAMP(3),
  "lastCheckedAt" TIMESTAMP(3), "verifiedAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3),
  "failureReason" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL,
  "verificationExpiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UsdtBep20Attempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UsdtBep20Attempt_rateSnapshot_check" CHECK ("rateSnapshot" BETWEEN 5000 AND 100000),
  CONSTRAINT "UsdtBep20Attempt_baseUsdtMicros_check" CHECK ("baseUsdtMicros" > 0),
  CONSTRAINT "UsdtBep20Attempt_uniqueMicros_check" CHECK ("uniqueMicros" BETWEEN 1 AND 999),
  CONSTRAINT "UsdtBep20Attempt_expectedUsdtMicros_check" CHECK ("expectedUsdtMicros" = "baseUsdtMicros" + "uniqueMicros"),
  CONSTRAINT "UsdtBep20Attempt_expectedTokenUnits_check" CHECK ("expectedTokenUnits" > 0),
  CONSTRAINT "UsdtBep20Attempt_recipientAddressSnapshot_check" CHECK ("recipientAddressSnapshot" ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT "UsdtBep20Attempt_tokenContractSnapshot_check" CHECK ("tokenContractSnapshot" ~ '^0x[0-9a-f]{40}$'),
  CONSTRAINT "UsdtBep20Attempt_tokenDecimalsSnapshot_check" CHECK ("tokenDecimalsSnapshot" BETWEEN 6 AND 30),
  CONSTRAINT "UsdtBep20Attempt_chainIdSnapshot_check" CHECK ("chainIdSnapshot" = 56),
  CONSTRAINT "UsdtBep20Attempt_requiredConfirmationsSnapshot_check" CHECK ("requiredConfirmationsSnapshot" BETWEEN 1 AND 100),
  CONSTRAINT "UsdtBep20Attempt_txHash_check" CHECK ("txHash" IS NULL OR "txHash" ~ '^0x[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "UsdtBep20Attempt_orderId_key" ON "UsdtBep20Attempt"("orderId");
CREATE UNIQUE INDEX "UsdtBep20Attempt_txHash_key" ON "UsdtBep20Attempt"("txHash");
CREATE UNIQUE INDEX "UsdtBep20Attempt_active_expectedUsdtMicros_key" ON "UsdtBep20Attempt"("expectedUsdtMicros") WHERE "status" IN ('AWAITING_TX_HASH', 'VERIFYING', 'PENDING_CONFIRMATIONS', 'VERIFIED');
CREATE INDEX "UsdtBep20Attempt_status_lastCheckedAt_idx" ON "UsdtBep20Attempt"("status", "lastCheckedAt");
CREATE INDEX "UsdtBep20Attempt_status_expiresAt_idx" ON "UsdtBep20Attempt"("status", "expiresAt");
CREATE INDEX "UsdtBep20Attempt_status_verificationExpiresAt_idx" ON "UsdtBep20Attempt"("status", "verificationExpiresAt");
CREATE INDEX "UsdtBep20Attempt_expectedUsdtMicros_status_idx" ON "UsdtBep20Attempt"("expectedUsdtMicros", "status");
CREATE INDEX "UsdtBep20Attempt_createdAt_idx" ON "UsdtBep20Attempt"("createdAt");
ALTER TABLE "UsdtBep20Attempt" ADD CONSTRAINT "UsdtBep20Attempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_usdt_bep20_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."rateSnapshot" IS DISTINCT FROM OLD."rateSnapshot"
     OR NEW."baseUsdtMicros" IS DISTINCT FROM OLD."baseUsdtMicros" OR NEW."uniqueMicros" IS DISTINCT FROM OLD."uniqueMicros"
     OR NEW."expectedUsdtMicros" IS DISTINCT FROM OLD."expectedUsdtMicros" OR NEW."expectedTokenUnits" IS DISTINCT FROM OLD."expectedTokenUnits"
     OR NEW."recipientAddressSnapshot" IS DISTINCT FROM OLD."recipientAddressSnapshot" OR NEW."tokenContractSnapshot" IS DISTINCT FROM OLD."tokenContractSnapshot"
     OR NEW."tokenDecimalsSnapshot" IS DISTINCT FROM OLD."tokenDecimalsSnapshot" OR NEW."chainIdSnapshot" IS DISTINCT FROM OLD."chainIdSnapshot"
     OR NEW."requiredConfirmationsSnapshot" IS DISTINCT FROM OLD."requiredConfirmationsSnapshot" OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR NEW."verificationExpiresAt" IS DISTINCT FROM OLD."verificationExpiresAt" THEN RAISE EXCEPTION 'USDT BEP20 payment snapshots are immutable';
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "UsdtBep20Attempt_protect_snapshots" BEFORE UPDATE ON "UsdtBep20Attempt" FOR EACH ROW EXECUTE FUNCTION "protect_usdt_bep20_snapshots"();
