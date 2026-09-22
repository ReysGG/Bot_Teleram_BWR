BEGIN;

ALTER TABLE "BotSession"
ADD COLUMN "lastInboundAt" TIMESTAMP(3),
ADD COLUMN "reengagementLastQueuedAt" TIMESTAMP(3),
ADD COLUMN "reengagementSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "telegramReachable" BOOLEAN NOT NULL DEFAULT true;

-- Start existing users from a fresh inactivity window so deployment cannot
-- immediately enqueue a historical-user blast.
UPDATE "BotSession"
SET "lastInboundAt" = CURRENT_TIMESTAMP
WHERE "lastInboundAt" IS NULL;

ALTER TABLE "BotSession"
ALTER COLUMN "lastInboundAt" SET DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "lastInboundAt" SET NOT NULL;

ALTER TABLE "StoreRuntimeSetting"
ADD COLUMN "reengagementEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reengagementBuyerInactiveDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "reengagementNonBuyerInactiveDays" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN "reengagementCooldownDays" INTEGER NOT NULL DEFAULT 14,
ADD COLUMN "reengagementMaxMessages" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN "reengagementBatchSize" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN "reengagementBuyerMessage" TEXT,
ADD COLUMN "reengagementNonBuyerMessage" TEXT,
ADD COLUMN "reengagementUpdatedBy" TEXT,
ADD COLUMN "reengagementUpdatedAt" TIMESTAMP(3);

CREATE INDEX "BotSession_reengagement_eligibility_idx"
ON "BotSession"(
    "telegramReachable",
    "lastInboundAt",
    "reengagementSequence",
    "chatId"
);

CREATE INDEX "BotSession_reengagementLastQueuedAt_lastInboundAt_idx"
ON "BotSession"("reengagementLastQueuedAt", "lastInboundAt");

CREATE INDEX "TelegramNotification_chatId_kind_status_createdAt_idx"
ON "TelegramNotification"("chatId", "kind", "status", "createdAt");

CREATE INDEX "TelegramNotification_kind_status_sentAt_idx"
ON "TelegramNotification"("kind", "status", "sentAt");

COMMIT;
