CREATE INDEX IF NOT EXISTS "SentDelivery_chatId_telegramMessageId_idx"
  ON "SentDelivery" ("chatId", "telegramMessageId");
