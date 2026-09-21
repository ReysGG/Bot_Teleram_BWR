BEGIN;

CREATE TYPE "QrisInvoiceEvidenceMode" AS ENUM ('ANDROID_NOTIFICATION', 'WEB_SESSION');

ALTER TABLE "QrisInvoiceAttempt"
  ADD COLUMN "evidenceMode" "QrisInvoiceEvidenceMode" NOT NULL DEFAULT 'ANDROID_NOTIFICATION',
  ADD CONSTRAINT "QrisInvoiceAttempt_shopee_snapshot_check" CHECK (
    ("evidenceMode" = 'ANDROID_NOTIFICATION')
    OR (
      "evidenceMode" = 'WEB_SESSION'
      AND "providerKeySnapshot" = 'SHOPEE_PARTNER'
      AND "shopeeSessionIdSnapshot" IS NOT NULL
      AND "shopeeAccountFingerprintSnapshot" ~ '^[a-f0-9]{64}$'
    )
  ),
  ADD CONSTRAINT "QrisInvoiceAttempt_shopee_fingerprint_check" CHECK (
    "shopeeAccountFingerprintSnapshot" IS NULL
    OR "shopeeAccountFingerprintSnapshot" ~ '^[a-f0-9]{64}$'
  );

CREATE UNIQUE INDEX "ShopeePartnerTransaction_qrisInvoiceAttemptId_key"
  ON "ShopeePartnerTransaction"("qrisInvoiceAttemptId");

CREATE INDEX "QrisAttempt_shopee_web_match_idx"
  ON "QrisInvoiceAttempt"(
    "evidenceMode",
    "providerKeySnapshot",
    "shopeeAccountFingerprintSnapshot",
    "status",
    "amount",
    "expiresAt"
  );

COMMIT;
