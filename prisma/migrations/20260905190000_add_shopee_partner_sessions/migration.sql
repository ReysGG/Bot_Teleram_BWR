BEGIN;

CREATE TYPE "ShopeePartnerSessionStatus" AS ENUM ('PENDING_VALIDATION', 'ACTIVE', 'EXPIRED', 'REVOKED', 'ERROR');
CREATE TYPE "ShopeePartnerTransactionStatus" AS ENUM ('RECEIVED', 'MATCHED', 'CONFIRMED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED');

ALTER TABLE "QrisInvoiceAttempt"
  ADD COLUMN "shopeeSessionIdSnapshot" TEXT,
  ADD COLUMN "shopeeAccountFingerprintSnapshot" TEXT;

CREATE TABLE "ShopeePartnerSession" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedCookieJar" TEXT,
  "cookieEncryptionIv" TEXT,
  "cookieEncryptionTag" TEXT,
  "cookieFingerprint" TEXT,
  "encryptedApiToken" TEXT,
  "apiTokenEncryptionIv" TEXT,
  "apiTokenEncryptionTag" TEXT,
  "apiTokenFingerprint" TEXT,
  "merchantAccountFingerprint" TEXT,
  "merchantId" TEXT,
  "storeId" TEXT,
  "status" "ShopeePartnerSessionStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
  "pollingLeaseToken" TEXT,
  "pollingLeaseExpiresAt" TIMESTAMP(3),
  "pollWindowStartAt" TIMESTAMP(3),
  "pollCursor" TEXT,
  "lastValidatedAt" TIMESTAMP(3),
  "lastSuccessfulPollAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeePartnerSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopeePartnerSession_credential_state_check" CHECK (
    ("status" = 'REVOKED' AND "encryptedCookieJar" IS NULL AND "cookieEncryptionIv" IS NULL AND "cookieEncryptionTag" IS NULL AND "cookieFingerprint" IS NULL AND "encryptedApiToken" IS NULL AND "apiTokenEncryptionIv" IS NULL AND "apiTokenEncryptionTag" IS NULL AND "apiTokenFingerprint" IS NULL)
    OR
    ("status" <> 'REVOKED' AND "encryptedCookieJar" IS NOT NULL AND "cookieEncryptionIv" IS NOT NULL AND "cookieEncryptionTag" IS NOT NULL AND "cookieFingerprint" IS NOT NULL AND "encryptedApiToken" IS NOT NULL AND "apiTokenEncryptionIv" IS NOT NULL AND "apiTokenEncryptionTag" IS NOT NULL AND "apiTokenFingerprint" IS NOT NULL)
  ),
  CONSTRAINT "ShopeePartnerSession_lease_pair_check" CHECK (("pollingLeaseToken" IS NULL) = ("pollingLeaseExpiresAt" IS NULL)),
  CONSTRAINT "ShopeePartnerSession_active_account_check" CHECK ("status" <> 'ACTIVE' OR "merchantAccountFingerprint" IS NOT NULL)
);

CREATE TABLE "ShopeePartnerTransaction" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "merchantAccountFingerprint" TEXT NOT NULL,
  "externalTransactionId" TEXT NOT NULL,
  "merchantExternalTransactionId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "service" INTEGER NOT NULL,
  "transactionType" INTEGER NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "rawPayloadHash" TEXT NOT NULL,
  "status" "ShopeePartnerTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
  "qrisInvoiceAttemptId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ShopeePartnerTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ShopeePartnerTransaction_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "ShopeePartnerTransaction_external_id_check" CHECK (length("externalTransactionId") BETWEEN 1 AND 256),
  CONSTRAINT "ShopeePartnerTransaction_merchant_external_id_check" CHECK (length("merchantExternalTransactionId") BETWEEN 1 AND 256),
  CONSTRAINT "ShopeePartnerTransaction_merchant_id_check" CHECK ("merchantId" ~ '^[0-9]+$' AND "storeId" ~ '^[0-9]+$'),
  CONSTRAINT "ShopeePartnerTransaction_service_check" CHECK ("service" IN (1, 3)),
  CONSTRAINT "ShopeePartnerTransaction_type_check" CHECK ("transactionType" = 1),
  CONSTRAINT "ShopeePartnerTransaction_status_code_check" CHECK ("statusCode" = 3),
  CONSTRAINT "ShopeePartnerTransaction_account_fingerprint_check" CHECK (length("merchantAccountFingerprint") = 64),
  CONSTRAINT "ShopeePartnerTransaction_payload_hash_check" CHECK (length("rawPayloadHash") = 64)
);

CREATE UNIQUE INDEX "ShopeePartnerSession_cookieFingerprint_key" ON "ShopeePartnerSession"("cookieFingerprint");
CREATE UNIQUE INDEX "ShopeePartnerSession_pollingLeaseToken_key" ON "ShopeePartnerSession"("pollingLeaseToken");
CREATE INDEX "ShopeePartnerSession_status_lease_poll_idx" ON "ShopeePartnerSession"("status", "pollingLeaseExpiresAt", "lastSuccessfulPollAt");
CREATE UNIQUE INDEX "ShopeePartnerTransaction_account_external_key" ON "ShopeePartnerTransaction"("merchantAccountFingerprint", "externalTransactionId");
CREATE INDEX "ShopeePartnerTransaction_status_occurredAt_idx" ON "ShopeePartnerTransaction"("status", "occurredAt");
CREATE INDEX "ShopeePartnerTransaction_sessionId_occurredAt_idx" ON "ShopeePartnerTransaction"("sessionId", "occurredAt");
CREATE INDEX "ShopeePartnerTransaction_qrisInvoiceAttemptId_idx" ON "ShopeePartnerTransaction"("qrisInvoiceAttemptId");
CREATE INDEX "QrisAttempt_shopee_account_status_amount_idx" ON "QrisInvoiceAttempt"("shopeeAccountFingerprintSnapshot", "status", "amount", "expiresAt");

ALTER TABLE "ShopeePartnerTransaction"
  ADD CONSTRAINT "ShopeePartnerTransaction_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "ShopeePartnerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ShopeePartnerTransaction"
  ADD CONSTRAINT "ShopeePartnerTransaction_qrisInvoiceAttemptId_fkey"
  FOREIGN KEY ("qrisInvoiceAttemptId") REFERENCES "QrisInvoiceAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
