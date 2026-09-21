ALTER TYPE "BotSessionState" ADD VALUE IF NOT EXISTS 'AWAITING_PRODUCT_SEARCH';
ALTER TYPE "BotSessionState" ADD VALUE IF NOT EXISTS 'AWAITING_REFERRAL_CODE';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'REFERRAL_REWARD';
ALTER TYPE "WalletTransactionType" ADD VALUE IF NOT EXISTS 'REFERRAL_JOIN_BONUS';

ALTER TABLE "BotSession"
  ADD COLUMN "catalogSearchQuery" TEXT,
  ADD COLUMN "smsSearchQuery" TEXT;

CREATE TYPE "ReferralAttributionStatus" AS ENUM ('REWARDED');

CREATE TABLE "ReferralProgramSetting" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "pointsPerJoin" INTEGER NOT NULL DEFAULT 1,
  "claimThresholdPoints" INTEGER NOT NULL DEFAULT 10,
  "claimRewardAmount" INTEGER NOT NULL DEFAULT 0,
  "newUserReward" INTEGER NOT NULL DEFAULT 0,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralProgramSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralCode" (
  "id" TEXT NOT NULL,
  "ownerChatId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "ownerUsername" TEXT,
  "ownerDisplayName" TEXT,
  "pointBalance" INTEGER NOT NULL DEFAULT 0,
  "totalPointsEarned" INTEGER NOT NULL DEFAULT 0,
  "totalPointsClaimed" INTEGER NOT NULL DEFAULT 0,
  "totalRewardClaimed" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralAttribution" (
  "id" TEXT NOT NULL,
  "referralCodeId" TEXT NOT NULL,
  "referralCodeSnapshot" TEXT NOT NULL,
  "referrerChatId" TEXT NOT NULL,
  "referredChatId" TEXT NOT NULL,
  "referredUsername" TEXT,
  "referredDisplayName" TEXT,
  "pointsAwarded" INTEGER NOT NULL,
  "newUserReward" INTEGER NOT NULL,
  "status" "ReferralAttributionStatus" NOT NULL DEFAULT 'REWARDED',
  "rewardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReferralClaim" (
  "id" TEXT NOT NULL,
  "referralCodeId" TEXT NOT NULL,
  "ownerChatId" TEXT NOT NULL,
  "pointsSpent" INTEGER NOT NULL,
  "rewardAmount" INTEGER NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferralClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReferralCode_ownerChatId_key" ON "ReferralCode"("ownerChatId");
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");
CREATE INDEX "ReferralCode_createdAt_idx" ON "ReferralCode"("createdAt");
CREATE UNIQUE INDEX "ReferralAttribution_referredChatId_key" ON "ReferralAttribution"("referredChatId");
CREATE INDEX "ReferralAttribution_referrerChatId_createdAt_idx" ON "ReferralAttribution"("referrerChatId", "createdAt");
CREATE INDEX "ReferralAttribution_referralCodeId_createdAt_idx" ON "ReferralAttribution"("referralCodeId", "createdAt");
CREATE INDEX "ReferralAttribution_createdAt_idx" ON "ReferralAttribution"("createdAt");
CREATE UNIQUE INDEX "ReferralClaim_idempotencyKey_key" ON "ReferralClaim"("idempotencyKey");
CREATE INDEX "ReferralClaim_ownerChatId_createdAt_idx" ON "ReferralClaim"("ownerChatId", "createdAt");
CREATE INDEX "ReferralClaim_referralCodeId_createdAt_idx" ON "ReferralClaim"("referralCodeId", "createdAt");
CREATE INDEX "ReferralCode_ownerUsername_trgm_idx" ON "ReferralCode" USING GIN ("ownerUsername" gin_trgm_ops);
CREATE INDEX "ReferralCode_ownerDisplayName_trgm_idx" ON "ReferralCode" USING GIN ("ownerDisplayName" gin_trgm_ops);
CREATE INDEX "ReferralAttribution_codeSnapshot_trgm_idx" ON "ReferralAttribution" USING GIN ("referralCodeSnapshot" gin_trgm_ops);
CREATE INDEX "ReferralAttribution_referredUsername_trgm_idx" ON "ReferralAttribution" USING GIN ("referredUsername" gin_trgm_ops);
CREATE INDEX "ReferralAttribution_referredDisplayName_trgm_idx" ON "ReferralAttribution" USING GIN ("referredDisplayName" gin_trgm_ops);

ALTER TABLE "ReferralAttribution"
  ADD CONSTRAINT "ReferralAttribution_referralCodeId_fkey"
  FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReferralClaim"
  ADD CONSTRAINT "ReferralClaim_referralCodeId_fkey"
  FOREIGN KEY ("referralCodeId") REFERENCES "ReferralCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
