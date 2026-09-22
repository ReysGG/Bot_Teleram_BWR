ALTER TABLE "WalletTopup"
  ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'DANA_RELAY',
  ADD CONSTRAINT "WalletTopup_paymentMethod_check"
    CHECK ("paymentMethod" IN ('DANA_RELAY', 'JAGO_TRANSFER'));

CREATE TABLE "JagoWalletTopupAttempt" (
  "id" TEXT NOT NULL,
  "walletTopupId" TEXT NOT NULL,
  "recipientAccountNumberSnapshot" TEXT NOT NULL,
  "status" "JagoTransferStatus" NOT NULL DEFAULT 'AWAITING_TRANSFER',
  "matchedEventId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JagoWalletTopupAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JagoWalletTopupAttempt_recipientAccountNumberSnapshot_check"
    CHECK ("recipientAccountNumberSnapshot" ~ '^[0-9]{8,20}$')
);

CREATE UNIQUE INDEX "JagoWalletTopupAttempt_walletTopupId_key"
  ON "JagoWalletTopupAttempt"("walletTopupId");
CREATE UNIQUE INDEX "JagoWalletTopupAttempt_matchedEventId_key"
  ON "JagoWalletTopupAttempt"("matchedEventId");
CREATE INDEX "JagoWalletTopupAttempt_status_expiresAt_idx"
  ON "JagoWalletTopupAttempt"("status", "expiresAt");
CREATE INDEX "JagoWalletTopupAttempt_createdAt_idx"
  ON "JagoWalletTopupAttempt"("createdAt");
CREATE INDEX "WalletTopup_paymentMethod_status_billedAmount_expiresAt_idx"
  ON "WalletTopup"("paymentMethod", "status", "billedAmount", "expiresAt");

ALTER TABLE "JagoWalletTopupAttempt"
  ADD CONSTRAINT "JagoWalletTopupAttempt_walletTopupId_fkey"
  FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_jago_wallet_topup_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."walletTopupId" IS DISTINCT FROM OLD."walletTopupId"
     OR NEW."recipientAccountNumberSnapshot" IS DISTINCT FROM OLD."recipientAccountNumberSnapshot"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
    RAISE EXCEPTION 'Jago wallet topup snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JagoWalletTopupAttempt_protect_snapshots"
  BEFORE UPDATE ON "JagoWalletTopupAttempt"
  FOR EACH ROW EXECUTE FUNCTION "protect_jago_wallet_topup_snapshots"();
