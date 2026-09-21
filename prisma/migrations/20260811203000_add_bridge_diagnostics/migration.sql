ALTER TABLE "BridgeDeviceStatus"
  ADD COLUMN "pendingQueueSize" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "blockedQueueSize" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "oldestQueuedAt" TIMESTAMP(3),
  ADD COLUMN "highestAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastErrorCode" TEXT,
  ADD COLUMN "appVersion" TEXT,
  ADD COLUMN "appVersionCode" INTEGER,
  ADD COLUMN "listenerConnected" BOOLEAN,
  ADD COLUMN "queueStorageVersion" INTEGER;

-- Buyer fulfillment must always cut ahead of catalog broadcasts already queued.
UPDATE "TelegramNotification"
SET "priority" = 1
WHERE "kind" = 'PAYMENT_SUCCESS'
  AND "status" IN ('PENDING', 'PROCESSING');

UPDATE "TelegramNotification"
SET "priority" = 2
WHERE "kind" = 'DIGITAL_FILE'
  AND "status" IN ('PENDING', 'PROCESSING');
