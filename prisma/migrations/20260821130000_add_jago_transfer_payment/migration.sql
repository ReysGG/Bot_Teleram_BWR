CREATE TYPE "JagoTransferStatus" AS ENUM (
  'AWAITING_TRANSFER',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED'
);

ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "jagoTransferEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "jagoTransferAccountNumber" TEXT,
  ADD COLUMN "jagoTransferUpdatedBy" TEXT,
  ADD COLUMN "jagoTransferUpdatedAt" TIMESTAMP(3),
  ADD CONSTRAINT "StoreRuntimeSetting_jagoTransferAccountNumber_check"
    CHECK (
      "jagoTransferAccountNumber" IS NULL
      OR "jagoTransferAccountNumber" ~ '^[0-9]{8,20}$'
    );

ALTER TABLE "BridgePaymentEvent"
  ADD COLUMN "provider" TEXT;

CREATE TABLE "JagoTransferAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "recipientAccountNumberSnapshot" TEXT NOT NULL,
  "status" "JagoTransferStatus" NOT NULL DEFAULT 'AWAITING_TRANSFER',
  "matchedEventId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JagoTransferAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JagoTransferAttempt_recipientAccountNumberSnapshot_check"
    CHECK ("recipientAccountNumberSnapshot" ~ '^[0-9]{8,20}$')
);

CREATE UNIQUE INDEX "JagoTransferAttempt_orderId_key"
  ON "JagoTransferAttempt"("orderId");
CREATE UNIQUE INDEX "JagoTransferAttempt_matchedEventId_key"
  ON "JagoTransferAttempt"("matchedEventId");
CREATE INDEX "JagoTransferAttempt_status_expiresAt_idx"
  ON "JagoTransferAttempt"("status", "expiresAt");
CREATE INDEX "JagoTransferAttempt_createdAt_idx"
  ON "JagoTransferAttempt"("createdAt");
CREATE INDEX "BridgePaymentEvent_provider_status_postedAt_idx"
  ON "BridgePaymentEvent"("provider", "status", "postedAt");

ALTER TABLE "JagoTransferAttempt"
  ADD CONSTRAINT "JagoTransferAttempt_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_jago_transfer_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."recipientAccountNumberSnapshot" IS DISTINCT FROM OLD."recipientAccountNumberSnapshot"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" THEN
    RAISE EXCEPTION 'Jago transfer snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "JagoTransferAttempt_protect_snapshots"
  BEFORE UPDATE ON "JagoTransferAttempt"
  FOR EACH ROW EXECUTE FUNCTION "protect_jago_transfer_snapshots"();
