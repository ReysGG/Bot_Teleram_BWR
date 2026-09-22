BEGIN;

ALTER TABLE "Product"
  ADD COLUMN "postDeliveryInstructions" TEXT,
  ADD COLUMN "redeemUrl" TEXT;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_postDeliveryInstructions_length_check"
    CHECK (
      "postDeliveryInstructions" IS NULL
      OR char_length("postDeliveryInstructions") <= 3200
    ),
  ADD CONSTRAINT "Product_redeemUrl_https_check"
    CHECK (
      "redeemUrl" IS NULL
      OR (
        char_length("redeemUrl") <= 2048
        AND "redeemUrl" ~ '^https://[^[:space:]]+$'
      )
    );

COMMIT;
