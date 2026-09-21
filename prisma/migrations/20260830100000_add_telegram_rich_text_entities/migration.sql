BEGIN;

ALTER TABLE "Product"
  ADD COLUMN "postDeliveryEntities" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "AdminBroadcast"
  ADD COLUMN "messageEntities" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_postDeliveryEntities_array_check"
    CHECK (
      jsonb_typeof("postDeliveryEntities") = 'array'
      AND jsonb_array_length("postDeliveryEntities") <= 100
    );

ALTER TABLE "AdminBroadcast"
  ADD CONSTRAINT "AdminBroadcast_messageEntities_array_check"
    CHECK (
      jsonb_typeof("messageEntities") = 'array'
      AND jsonb_array_length("messageEntities") <= 100
    );

COMMIT;
