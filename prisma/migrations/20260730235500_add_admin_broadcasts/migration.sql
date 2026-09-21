CREATE TABLE "AdminBroadcast" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "messageText" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminBroadcast_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramNotification"
ADD COLUMN "broadcastId" TEXT;

CREATE INDEX "AdminBroadcast_createdAt_idx"
ON "AdminBroadcast"("createdAt");

CREATE INDEX "TelegramNotification_broadcastId_status_idx"
ON "TelegramNotification"("broadcastId", "status");

ALTER TABLE "TelegramNotification"
ADD CONSTRAINT "TelegramNotification_broadcastId_fkey"
FOREIGN KEY ("broadcastId") REFERENCES "AdminBroadcast"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
