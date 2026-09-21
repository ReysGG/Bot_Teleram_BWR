BEGIN;

ALTER TABLE "QrisMerchant"
  ADD COLUMN "shopeeAccountFingerprint" TEXT,
  ADD CONSTRAINT "QrisMerchant_shopee_account_check"
    CHECK (
      "shopeeAccountFingerprint" IS NULL
      OR (
        "providerKey" = 'SHOPEE_PARTNER'
        AND "shopeeAccountFingerprint" ~ '^[a-f0-9]{64}$'
      )
    );

CREATE INDEX "QrisMerchant_provider_account_idx"
  ON "QrisMerchant"("providerKey", "shopeeAccountFingerprint");

COMMIT;
