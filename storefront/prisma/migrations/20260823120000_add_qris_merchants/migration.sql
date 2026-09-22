BEGIN;

CREATE TYPE "QrisInvoiceAttemptStatus" AS ENUM (
  'AWAITING_PAYMENT',
  'MATCHED',
  'CONFIRMED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "QrisMerchant" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "providerKey" TEXT NOT NULL,
  "encryptedBasePayload" TEXT NOT NULL,
  "basePayloadEncryptionIv" TEXT NOT NULL,
  "basePayloadEncryptionTag" TEXT NOT NULL,
  "payloadFingerprint" TEXT NOT NULL,
  "trustedDeviceId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT false,
  "activatedAt" TIMESTAMP(3),
  "activatedBy" TEXT,
  "archivedAt" TIMESTAMP(3),
  "archivedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrisMerchant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QrisMerchant_slug_check"
    CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("slug") <= 64),
  CONSTRAINT "QrisMerchant_name_check"
    CHECK (char_length(btrim("name")) BETWEEN 2 AND 100),
  CONSTRAINT "QrisMerchant_provider_check"
    CHECK ("providerKey" ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  CONSTRAINT "QrisMerchant_encryption_check"
    CHECK (
      char_length("encryptedBasePayload") > 0
      AND char_length("basePayloadEncryptionIv") > 0
      AND char_length("basePayloadEncryptionTag") > 0
    ),
  CONSTRAINT "QrisMerchant_fingerprint_check"
    CHECK ("payloadFingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "QrisMerchant_trusted_device_check"
    CHECK (
      "trustedDeviceId" IS NULL
      OR char_length(btrim("trustedDeviceId")) BETWEEN 8 AND 200
    ),
  CONSTRAINT "QrisMerchant_active_state_check"
    CHECK (NOT "isActive" OR ("enabled" AND "archivedAt" IS NULL))
);

CREATE UNIQUE INDEX "QrisMerchant_slug_key"
  ON "QrisMerchant"("slug");
CREATE UNIQUE INDEX "QrisMerchant_one_active_key"
  ON "QrisMerchant" ((true)) WHERE "isActive" = true;
CREATE INDEX "QrisMerchant_providerKey_enabled_archivedAt_idx"
  ON "QrisMerchant"("providerKey", "enabled", "archivedAt");
CREATE INDEX "QrisMerchant_createdAt_idx"
  ON "QrisMerchant"("createdAt");

CREATE TABLE "QrisInvoiceAttempt" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "walletTopupId" TEXT,
  "qrisMerchantId" TEXT,
  "merchantSlugSnapshot" TEXT NOT NULL,
  "merchantNameSnapshot" TEXT NOT NULL,
  "providerKeySnapshot" TEXT NOT NULL,
  "allowedPackageNamesSnapshot" TEXT[] NOT NULL,
  "allowedDeviceIdsSnapshot" TEXT[] NOT NULL,
  "encryptedBasePayloadSnapshot" TEXT NOT NULL,
  "basePayloadEncryptionIvSnapshot" TEXT NOT NULL,
  "basePayloadEncryptionTagSnapshot" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" "QrisInvoiceAttemptStatus" NOT NULL DEFAULT 'AWAITING_PAYMENT',
  "matchedEventId" TEXT,
  "matchedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QrisInvoiceAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "QrisAttempt_exactly_one_target_check"
    CHECK (num_nonnulls("orderId", "walletTopupId") = 1),
  CONSTRAINT "QrisAttempt_snapshot_check"
    CHECK (
      char_length(btrim("merchantSlugSnapshot")) > 0
      AND char_length(btrim("merchantNameSnapshot")) > 0
      AND "providerKeySnapshot" ~ '^[A-Z][A-Z0-9_]{1,63}$'
      AND cardinality("allowedPackageNamesSnapshot") > 0
      AND char_length("encryptedBasePayloadSnapshot") > 0
      AND char_length("basePayloadEncryptionIvSnapshot") > 0
      AND char_length("basePayloadEncryptionTagSnapshot") > 0
    ),
  CONSTRAINT "QrisAttempt_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "QrisAttempt_match_pair_check"
    CHECK (("matchedEventId" IS NULL) = ("matchedAt" IS NULL))
);

CREATE UNIQUE INDEX "QrisInvoiceAttempt_orderId_key"
  ON "QrisInvoiceAttempt"("orderId");
CREATE UNIQUE INDEX "QrisInvoiceAttempt_walletTopupId_key"
  ON "QrisInvoiceAttempt"("walletTopupId");
CREATE UNIQUE INDEX "QrisInvoiceAttempt_matchedEventId_key"
  ON "QrisInvoiceAttempt"("matchedEventId");
CREATE INDEX "QrisAttempt_merchant_status_expires_idx"
  ON "QrisInvoiceAttempt"("qrisMerchantId", "status", "expiresAt");
CREATE INDEX "QrisAttempt_provider_status_amount_exp_idx"
  ON "QrisInvoiceAttempt"("providerKeySnapshot", "status", "amount", "expiresAt");
CREATE INDEX "QrisAttempt_status_expires_idx"
  ON "QrisInvoiceAttempt"("status", "expiresAt");
CREATE INDEX "QrisAttempt_createdAt_idx"
  ON "QrisInvoiceAttempt"("createdAt");

ALTER TABLE "QrisInvoiceAttempt"
  ADD CONSTRAINT "QrisAttempt_order_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QrisInvoiceAttempt"
  ADD CONSTRAINT "QrisAttempt_wallet_topup_fkey"
  FOREIGN KEY ("walletTopupId") REFERENCES "WalletTopup"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QrisInvoiceAttempt"
  ADD CONSTRAINT "QrisAttempt_merchant_fkey"
  FOREIGN KEY ("qrisMerchantId") REFERENCES "QrisMerchant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QrisInvoiceAttempt"
  ADD CONSTRAINT "QrisAttempt_event_fkey"
  FOREIGN KEY ("matchedEventId") REFERENCES "BridgePaymentEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_qris_invoice_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId"
     OR NEW."walletTopupId" IS DISTINCT FROM OLD."walletTopupId"
     OR NEW."qrisMerchantId" IS DISTINCT FROM OLD."qrisMerchantId"
     OR NEW."merchantSlugSnapshot" IS DISTINCT FROM OLD."merchantSlugSnapshot"
     OR NEW."merchantNameSnapshot" IS DISTINCT FROM OLD."merchantNameSnapshot"
     OR NEW."providerKeySnapshot" IS DISTINCT FROM OLD."providerKeySnapshot"
     OR NEW."allowedPackageNamesSnapshot" IS DISTINCT FROM OLD."allowedPackageNamesSnapshot"
     OR NEW."allowedDeviceIdsSnapshot" IS DISTINCT FROM OLD."allowedDeviceIdsSnapshot"
     OR NEW."encryptedBasePayloadSnapshot" IS DISTINCT FROM OLD."encryptedBasePayloadSnapshot"
     OR NEW."basePayloadEncryptionIvSnapshot" IS DISTINCT FROM OLD."basePayloadEncryptionIvSnapshot"
     OR NEW."basePayloadEncryptionTagSnapshot" IS DISTINCT FROM OLD."basePayloadEncryptionTagSnapshot"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
     OR (
       OLD."matchedEventId" IS NOT NULL
       AND NEW."matchedEventId" IS DISTINCT FROM OLD."matchedEventId"
     )
     OR (
       OLD."matchedAt" IS NOT NULL
       AND NEW."matchedAt" IS DISTINCT FROM OLD."matchedAt"
     ) THEN
    RAISE EXCEPTION 'QRIS invoice snapshots are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "QrisInvoiceAttempt_protect_snapshots"
  BEFORE UPDATE ON "QrisInvoiceAttempt"
  FOR EACH ROW EXECUTE FUNCTION "protect_qris_invoice_snapshots"();

COMMIT;
