-- These indexes keep active invoice matching and unique-code allocation bounded
-- as historical payment rows grow.
CREATE INDEX IF NOT EXISTS "Payment_billedAmount_status_createdAt_expiresAt_idx"
  ON "Payment" ("billedAmount", "status", "createdAt", "expiresAt");

CREATE INDEX IF NOT EXISTS "Payment_uniqueCode_expiresAt_idx"
  ON "Payment" ("uniqueCode", "expiresAt");

CREATE INDEX IF NOT EXISTS "WalletTopup_uniqueCode_expiresAt_idx"
  ON "WalletTopup" ("uniqueCode", "expiresAt");

CREATE INDEX IF NOT EXISTS "WalletTopup_billedAmount_status_createdAt_expiresAt_idx"
  ON "WalletTopup" ("billedAmount", "status", "createdAt", "expiresAt");
