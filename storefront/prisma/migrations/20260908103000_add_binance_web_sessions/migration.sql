BEGIN;

CREATE TYPE "BinanceInternalVerifierMode" AS ENUM ('OFFICIAL_API', 'WEB_SESSION');
CREATE TYPE "BinanceWebSessionStatus" AS ENUM ('PENDING_VALIDATION', 'ACTIVE', 'CHALLENGED', 'EXPIRED', 'ERROR', 'REVOKED');
CREATE TYPE "BinanceWebTransactionStatus" AS ENUM ('RECEIVED', 'MATCHED', 'CONFIRMED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED');

CREATE TABLE "BinanceWebSession" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "encryptedCookieJar" TEXT,
  "cookieEncryptionIv" TEXT,
  "cookieEncryptionTag" TEXT,
  "cookieFingerprint" TEXT,
  "recipientBinanceId" TEXT,
  "accountFingerprint" TEXT,
  "status" "BinanceWebSessionStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "pollingLeaseToken" TEXT,
  "pollingLeaseExpiresAt" TIMESTAMP(3),
  "pollCursorTime" BIGINT,
  "lastValidatedAt" TIMESTAMP(3),
  "lastSuccessfulPollAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "activatedBy" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" TEXT,
  "createdBy" TEXT NOT NULL,
  "updatedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BinanceWebSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BinanceWebSession_name_check" CHECK (char_length("name") BETWEEN 2 AND 100),
  CONSTRAINT "BinanceWebSession_cookie_bundle_check" CHECK (
    ("encryptedCookieJar" IS NULL AND "cookieEncryptionIv" IS NULL AND "cookieEncryptionTag" IS NULL)
    OR
    ("encryptedCookieJar" IS NOT NULL AND "cookieEncryptionIv" IS NOT NULL AND "cookieEncryptionTag" IS NOT NULL)
  ),
  CONSTRAINT "BinanceWebSession_recipient_check" CHECK (
    "recipientBinanceId" IS NULL OR "recipientBinanceId" ~ '^[0-9]{5,32}$'
  ),
  CONSTRAINT "BinanceWebSession_account_fingerprint_check" CHECK (
    "accountFingerprint" IS NULL OR "accountFingerprint" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "BinanceWebSession_active_check" CHECK (
    "status" <> 'ACTIVE' OR (
      "recipientBinanceId" IS NOT NULL
      AND "accountFingerprint" IS NOT NULL
      AND "lastValidatedAt" IS NOT NULL
      AND "encryptedCookieJar" IS NOT NULL
    )
  ),
  CONSTRAINT "BinanceWebSession_primary_check" CHECK (
    NOT "isPrimary" OR (
      "status" = 'ACTIVE'
      AND "recipientBinanceId" IS NOT NULL
      AND "accountFingerprint" IS NOT NULL
      AND "lastValidatedAt" IS NOT NULL
      AND "encryptedCookieJar" IS NOT NULL
    )
  ),
  CONSTRAINT "BinanceWebSession_revoked_check" CHECK (
    "status" <> 'REVOKED' OR (
      NOT "isPrimary"
      AND "encryptedCookieJar" IS NULL
      AND "cookieEncryptionIv" IS NULL
      AND "cookieEncryptionTag" IS NULL
      AND "pollingLeaseToken" IS NULL
      AND "pollingLeaseExpiresAt" IS NULL
      AND "revokedAt" IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX "BinanceWebSession_cookieFingerprint_key"
  ON "BinanceWebSession"("cookieFingerprint");
CREATE UNIQUE INDEX "BinanceWebSession_pollingLeaseToken_key"
  ON "BinanceWebSession"("pollingLeaseToken");
CREATE UNIQUE INDEX "BinanceWebSession_primary_recipient_key"
  ON "BinanceWebSession"("recipientBinanceId")
  WHERE "isPrimary" = true AND "status" = 'ACTIVE';
CREATE INDEX "BinanceWebSession_status_primary_poll_idx"
  ON "BinanceWebSession"("status", "isPrimary", "pollingLeaseExpiresAt", "lastSuccessfulPollAt");
CREATE INDEX "BinanceWebSession_recipient_status_idx"
  ON "BinanceWebSession"("recipientBinanceId", "status", "isPrimary");

ALTER TABLE "BinanceInternalPaymentAttempt"
  ADD COLUMN "verifierMode" "BinanceInternalVerifierMode" NOT NULL DEFAULT 'OFFICIAL_API',
  ADD COLUMN "binanceWebSessionIdSnapshot" TEXT,
  ADD COLUMN "binanceAccountFingerprintSnapshot" TEXT,
  ADD CONSTRAINT "BinanceInternalPaymentAttempt_web_snapshot_check" CHECK (
    (
      "verifierMode" = 'OFFICIAL_API'
      AND "binanceWebSessionIdSnapshot" IS NULL
      AND "binanceAccountFingerprintSnapshot" IS NULL
    )
    OR
    (
      "verifierMode" = 'WEB_SESSION'
      AND "binanceWebSessionIdSnapshot" IS NOT NULL
      AND "binanceAccountFingerprintSnapshot" ~ '^[a-f0-9]{64}$'
    )
  );

ALTER TABLE "BinanceInternalPaymentAttempt"
  ADD CONSTRAINT "BinanceInternalPaymentAttempt_web_session_fkey"
  FOREIGN KEY ("binanceWebSessionIdSnapshot") REFERENCES "BinanceWebSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "BinanceAttempt_verifier_status_check_idx"
  ON "BinanceInternalPaymentAttempt"("verifierMode", "status", "lastCheckedAt");
CREATE INDEX "BinanceAttempt_web_account_amount_idx"
  ON "BinanceInternalPaymentAttempt"("binanceAccountFingerprintSnapshot", "expectedUsdtMicros", "status");

CREATE TABLE "BinanceWebTransaction" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "accountFingerprint" TEXT NOT NULL,
  "providerTransactionId" TEXT NOT NULL,
  "providerOrderId" TEXT,
  "transactionType" TEXT,
  "direction" TEXT NOT NULL,
  "providerStatus" TEXT NOT NULL,
  "providerStatusDetail" TEXT,
  "currency" TEXT NOT NULL,
  "amountMicros" BIGINT NOT NULL,
  "counterpartyName" TEXT,
  "viaAccountValue" TEXT,
  "receiverBinanceId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "rawPayloadHash" TEXT NOT NULL,
  "detailPayloadHash" TEXT,
  "status" "BinanceWebTransactionStatus" NOT NULL DEFAULT 'RECEIVED',
  "binanceInternalPaymentAttemptId" TEXT,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BinanceWebTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BinanceWebTransaction_account_check" CHECK ("accountFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "BinanceWebTransaction_provider_id_check" CHECK (
    char_length("providerTransactionId") BETWEEN 1 AND 128
    AND "providerTransactionId" ~ '^[A-Za-z0-9._:-]+$'
  ),
  CONSTRAINT "BinanceWebTransaction_order_id_check" CHECK (
    "providerOrderId" IS NULL OR (
      char_length("providerOrderId") BETWEEN 6 AND 148
      AND "providerOrderId" ~ '^[A-Za-z0-9_-]+$'
    )
  ),
  CONSTRAINT "BinanceWebTransaction_direction_check" CHECK ("direction" IN ('INCOME', 'PAYOUT')),
  CONSTRAINT "BinanceWebTransaction_status_check" CHECK (char_length("providerStatus") BETWEEN 1 AND 64),
  CONSTRAINT "BinanceWebTransaction_currency_check" CHECK ("currency" ~ '^[A-Z0-9]{2,20}$'),
  CONSTRAINT "BinanceWebTransaction_amount_check" CHECK ("amountMicros" > 0),
  CONSTRAINT "BinanceWebTransaction_receiver_check" CHECK (
    "receiverBinanceId" IS NULL OR "receiverBinanceId" ~ '^[0-9]{5,32}$'
  ),
  CONSTRAINT "BinanceWebTransaction_raw_hash_check" CHECK ("rawPayloadHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "BinanceWebTransaction_detail_hash_check" CHECK (
    "detailPayloadHash" IS NULL OR "detailPayloadHash" ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT "BinanceWebTransaction_binding_check" CHECK (
    (
      "binanceInternalPaymentAttemptId" IS NULL
      AND "status" IN ('RECEIVED', 'UNMATCHED', 'AMBIGUOUS', 'REJECTED')
    )
    OR
    (
      "binanceInternalPaymentAttemptId" IS NOT NULL
      AND "status" IN ('MATCHED', 'CONFIRMED')
    )
  ),
  CONSTRAINT "BinanceWebTransaction_confirmed_at_check" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL)
    OR ("status" <> 'CONFIRMED' AND "confirmedAt" IS NULL)
  )
);

CREATE UNIQUE INDEX "BinanceWebTransaction_attempt_key"
  ON "BinanceWebTransaction"("binanceInternalPaymentAttemptId");
CREATE UNIQUE INDEX "BinanceWebTransaction_account_provider_key"
  ON "BinanceWebTransaction"("accountFingerprint", "providerTransactionId");
CREATE INDEX "BinanceWebTransaction_session_occurred_idx"
  ON "BinanceWebTransaction"("sessionId", "occurredAt");
CREATE INDEX "BinanceWebTransaction_account_amount_time_idx"
  ON "BinanceWebTransaction"("accountFingerprint", "amountMicros", "occurredAt");
CREATE INDEX "BinanceWebTransaction_order_id_idx"
  ON "BinanceWebTransaction"("providerOrderId");
CREATE INDEX "BinanceWebTransaction_status_occurred_idx"
  ON "BinanceWebTransaction"("status", "occurredAt");

ALTER TABLE "BinanceWebTransaction"
  ADD CONSTRAINT "BinanceWebTransaction_session_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "BinanceWebSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BinanceWebTransaction"
  ADD CONSTRAINT "BinanceWebTransaction_attempt_fkey"
  FOREIGN KEY ("binanceInternalPaymentAttemptId") REFERENCES "BinanceInternalPaymentAttempt"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "BinanceWebPollMetric" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "bucketStart" TIMESTAMP(3) NOT NULL,
  "runs" INTEGER NOT NULL DEFAULT 0,
  "successfulRuns" INTEGER NOT NULL DEFAULT 0,
  "failedRuns" INTEGER NOT NULL DEFAULT 0,
  "pages" INTEGER NOT NULL DEFAULT 0,
  "received" INTEGER NOT NULL DEFAULT 0,
  "detailCalls" INTEGER NOT NULL DEFAULT 0,
  "unauthorized" INTEGER NOT NULL DEFAULT 0,
  "rateLimited" INTEGER NOT NULL DEFAULT 0,
  "challenged" INTEGER NOT NULL DEFAULT 0,
  "contractUnknown" INTEGER NOT NULL DEFAULT 0,
  "accountMismatch" INTEGER NOT NULL DEFAULT 0,
  "identityUnproven" INTEGER NOT NULL DEFAULT 0,
  "errors" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BinanceWebPollMetric_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BinanceWebPollMetric_counts_check" CHECK (
    "runs" >= 0
    AND "successfulRuns" >= 0
    AND "failedRuns" >= 0
    AND "pages" >= 0
    AND "received" >= 0
    AND "detailCalls" >= 0
    AND "unauthorized" >= 0
    AND "rateLimited" >= 0
    AND "challenged" >= 0
    AND "contractUnknown" >= 0
    AND "accountMismatch" >= 0
    AND "identityUnproven" >= 0
    AND "errors" >= 0
    AND "successfulRuns" + "failedRuns" = "runs"
  ),
  CONSTRAINT "BinanceWebPollMetric_error_code_check" CHECK (
    "lastErrorCode" IS NULL OR char_length("lastErrorCode") BETWEEN 1 AND 64
  )
);

CREATE UNIQUE INDEX "BinanceWebPollMetric_session_bucket_key"
  ON "BinanceWebPollMetric"("sessionId", "bucketStart");
CREATE INDEX "BinanceWebPollMetric_bucket_idx"
  ON "BinanceWebPollMetric"("bucketStart");
CREATE INDEX "BinanceWebPollMetric_session_bucket_idx"
  ON "BinanceWebPollMetric"("sessionId", "bucketStart");

ALTER TABLE "BinanceWebPollMetric"
  ADD CONSTRAINT "BinanceWebPollMetric_session_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "BinanceWebSession"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "protect_binance_internal_payment_snapshots"() RETURNS trigger AS $$
BEGIN
  IF NEW."orderId" IS DISTINCT FROM OLD."orderId" OR NEW."rateSnapshot" IS DISTINCT FROM OLD."rateSnapshot"
     OR NEW."baseUsdtMicros" IS DISTINCT FROM OLD."baseUsdtMicros" OR NEW."uniqueMicros" IS DISTINCT FROM OLD."uniqueMicros"
     OR NEW."expectedUsdtMicros" IS DISTINCT FROM OLD."expectedUsdtMicros"
     OR NEW."recipientBinanceIdSnapshot" IS DISTINCT FROM OLD."recipientBinanceIdSnapshot"
     OR NEW."verifierMode" IS DISTINCT FROM OLD."verifierMode"
     OR NEW."binanceWebSessionIdSnapshot" IS DISTINCT FROM OLD."binanceWebSessionIdSnapshot"
     OR NEW."binanceAccountFingerprintSnapshot" IS DISTINCT FROM OLD."binanceAccountFingerprintSnapshot"
     OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt" OR NEW."verificationExpiresAt" IS DISTINCT FROM OLD."verificationExpiresAt" THEN
    RAISE EXCEPTION 'Binance internal payment snapshots are immutable';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

COMMIT;
