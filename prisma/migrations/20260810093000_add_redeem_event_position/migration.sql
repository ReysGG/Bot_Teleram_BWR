ALTER TABLE "AccountRedeemEvent"
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AccountRedeemEvent"
  ALTER COLUMN "position" DROP DEFAULT;
