-- Prepared only. Apply only after explicit database-operation authorization.
BEGIN;
ALTER TABLE "WebCustomer"
  ADD COLUMN "clerkIssuer" TEXT,
  ADD COLUMN "clerkUserId" TEXT,
  ADD COLUMN "clerkLinkedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "WebCustomer_clerkIssuer_clerkUserId_key"
  ON "WebCustomer"("clerkIssuer", "clerkUserId");
ALTER TABLE "WebCustomer" ADD CONSTRAINT "WebCustomer_clerk_identity_pair_check"
  CHECK (("clerkIssuer" IS NULL AND "clerkUserId" IS NULL AND "clerkLinkedAt" IS NULL)
    OR ("clerkIssuer" IS NOT NULL AND "clerkUserId" IS NOT NULL AND "clerkLinkedAt" IS NOT NULL));
COMMIT;
