CREATE TYPE "OrderChannel" AS ENUM ('TELEGRAM', 'WEB');
CREATE TYPE "WebContactType" AS ENUM ('EMAIL');
CREATE TYPE "DeliveryChannel" AS ENUM ('TELEGRAM', 'WEB');

ALTER TYPE "DeliveryReceiptStatus" ADD VALUE 'READY' BEFORE 'SENDING';

CREATE TABLE "WebCustomer" (
    "id" TEXT NOT NULL,
    "contactType" "WebContactType" NOT NULL DEFAULT 'EMAIL',
    "contactLookupHash" TEXT NOT NULL,
    "contactMasked" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastAuthenticatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebCustomer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebCustomerSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "webCustomerId" TEXT NOT NULL,
    "userAgentHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebCustomerSession_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order"
    ADD COLUMN "channel" "OrderChannel" NOT NULL DEFAULT 'TELEGRAM',
    ADD COLUMN "webCustomerId" TEXT;

ALTER TABLE "SentDelivery"
    ADD COLUMN "channel" "DeliveryChannel" NOT NULL DEFAULT 'TELEGRAM',
    ADD COLUMN "downloadCount" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastDownloadedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "WebCustomer_contactLookupHash_key" ON "WebCustomer"("contactLookupHash");
CREATE INDEX "WebCustomer_createdAt_idx" ON "WebCustomer"("createdAt");
CREATE INDEX "WebCustomer_lockedUntil_idx" ON "WebCustomer"("lockedUntil");
CREATE UNIQUE INDEX "WebCustomerSession_tokenHash_key" ON "WebCustomerSession"("tokenHash");
CREATE INDEX "WebCustomerSession_webCustomerId_expiresAt_idx" ON "WebCustomerSession"("webCustomerId", "expiresAt");
CREATE INDEX "WebCustomerSession_expiresAt_revokedAt_idx" ON "WebCustomerSession"("expiresAt", "revokedAt");
CREATE INDEX "Order_webCustomerId_createdAt_idx" ON "Order"("webCustomerId", "createdAt");
CREATE INDEX "Order_channel_status_createdAt_idx" ON "Order"("channel", "status", "createdAt");
CREATE INDEX "SentDelivery_channel_status_createdAt_idx" ON "SentDelivery"("channel", "status", "createdAt");

ALTER TABLE "WebCustomerSession"
    ADD CONSTRAINT "WebCustomerSession_webCustomerId_fkey"
    FOREIGN KEY ("webCustomerId") REFERENCES "WebCustomer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_webCustomerId_fkey"
    FOREIGN KEY ("webCustomerId") REFERENCES "WebCustomer"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order"
    ADD CONSTRAINT "Order_channel_owner_check"
    CHECK (
      ("channel" = 'TELEGRAM' AND "webCustomerId" IS NULL) OR
      ("channel" = 'WEB' AND "webCustomerId" IS NOT NULL)
    );

ALTER TABLE "SentDelivery"
    ADD CONSTRAINT "SentDelivery_channel_state_check"
    CHECK (
      ("channel" = 'TELEGRAM' AND "status" <> 'READY') OR
      ("channel" = 'WEB' AND "telegramMessageId" IS NULL)
    );
