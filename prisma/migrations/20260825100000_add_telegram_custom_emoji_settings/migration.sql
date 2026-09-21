BEGIN;

ALTER TABLE "StoreRuntimeSetting"
  ADD COLUMN "telegramChatgptCustomEmojiId" TEXT,
  ADD COLUMN "telegramClaudeCustomEmojiId" TEXT,
  ADD COLUMN "telegramCustomEmojiMap" JSONB,
  ADD COLUMN "telegramCustomEmojiUpdatedBy" TEXT,
  ADD COLUMN "telegramCustomEmojiUpdatedAt" TIMESTAMP(3);

ALTER TABLE "StoreRuntimeSetting"
  ADD CONSTRAINT "StoreRuntimeSetting_telegramChatgptCustomEmojiId_check"
    CHECK (
      "telegramChatgptCustomEmojiId" IS NULL
      OR "telegramChatgptCustomEmojiId" ~ '^[0-9]+$'
    ),
  ADD CONSTRAINT "StoreRuntimeSetting_telegramClaudeCustomEmojiId_check"
    CHECK (
      "telegramClaudeCustomEmojiId" IS NULL
      OR "telegramClaudeCustomEmojiId" ~ '^[0-9]+$'
    ),
  ADD CONSTRAINT "StoreRuntimeSetting_telegramCustomEmojiMap_check"
    CHECK (
      "telegramCustomEmojiMap" IS NULL
      OR jsonb_typeof("telegramCustomEmojiMap") = 'object'
    );

COMMIT;
