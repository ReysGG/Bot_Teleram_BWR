import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { telegramStoreBotUrl } from "@/server/telegram/success-channel";
import { applyWalletTransaction } from "@/server/wallet/ledger";

const REFERRAL_SETTING_ID = "global";
const REFERRAL_CODE_PATTERN = /^[A-Z0-9_]{3,20}$/;

type BuyerIdentity = {
  buyerUsername?: string | null;
  buyerDisplayName?: string | null;
};

export function normalizeReferralCode(value: string): string {
  return value.trim().replace(/^ref_/i, "").toUpperCase();
}

export function validateReferralCode(value: string): string {
  const code = normalizeReferralCode(value);
  if (!REFERRAL_CODE_PATTERN.test(code)) {
    throw new Error("Kode referral harus 3-20 karakter: huruf, angka, atau underscore");
  }
  return code;
}

export function referralLink(code: string): string {
  return `${telegramStoreBotUrl()}?start=ref_${validateReferralCode(code)}`;
}

export async function getReferralProgramState() {
  const setting = await prisma.referralProgramSetting.findUnique({
    where: { id: REFERRAL_SETTING_ID },
  });
  return {
    enabled: setting?.enabled ?? false,
    pointsPerJoin: setting?.pointsPerJoin ?? 1,
    claimThresholdPoints: setting?.claimThresholdPoints ?? 10,
    claimRewardAmount: setting?.claimRewardAmount ?? 0,
    newUserReward: setting?.newUserReward ?? 0,
    updatedAt: setting?.updatedAt ?? null,
    updatedBy: setting?.updatedBy ?? null,
  };
}

export async function setReferralProgramState(input: {
  enabled: boolean;
  pointsPerJoin: number;
  claimThresholdPoints: number;
  claimRewardAmount: number;
  newUserReward: number;
  actor: string;
}) {
  for (const points of [input.pointsPerJoin, input.claimThresholdPoints]) {
    if (!Number.isSafeInteger(points) || points < 1 || points > 1_000_000) {
      throw new Error("Konfigurasi poin referral tidak valid");
    }
  }
  for (const amount of [input.claimRewardAmount, input.newUserReward]) {
    if (!Number.isSafeInteger(amount) || amount < 0 || amount > 10_000_000) {
      throw new Error("Nominal reward referral tidak valid");
    }
  }
  return prisma.referralProgramSetting.upsert({
    where: { id: REFERRAL_SETTING_ID },
    create: {
      id: REFERRAL_SETTING_ID,
      enabled: input.enabled,
      pointsPerJoin: input.pointsPerJoin,
      claimThresholdPoints: input.claimThresholdPoints,
      claimRewardAmount: input.claimRewardAmount,
      newUserReward: input.newUserReward,
      updatedBy: input.actor,
    },
    update: {
      enabled: input.enabled,
      pointsPerJoin: input.pointsPerJoin,
      claimThresholdPoints: input.claimThresholdPoints,
      claimRewardAmount: input.claimRewardAmount,
      newUserReward: input.newUserReward,
      updatedBy: input.actor,
    },
  });
}

export async function createOrUpdateReferralCode(input: {
  chatId: string;
  code: string;
  identity?: BuyerIdentity;
}) {
  const code = validateReferralCode(input.code);
  try {
    return await prisma.referralCode.upsert({
      where: { ownerChatId: input.chatId },
      create: {
        ownerChatId: input.chatId,
        code,
        ownerUsername: input.identity?.buyerUsername ?? null,
        ownerDisplayName: input.identity?.buyerDisplayName ?? null,
      },
      update: {
        code,
        ownerUsername: input.identity?.buyerUsername ?? null,
        ownerDisplayName: input.identity?.buyerDisplayName ?? null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("Kode referral tersebut sudah dipakai user lain");
    }
    throw error;
  }
}

export type ReferralJoinResult =
  | { status: "rewarded"; pointsAwarded: number; newUserReward: number }
  | { status: "disabled" | "not_found" | "not_new" | "self" | "already_used" };

export async function applyReferralOnFirstJoin(input: {
  referredChatId: string;
  rawCode: string;
  isNewSession: boolean;
  identity?: BuyerIdentity;
}): Promise<ReferralJoinResult> {
  if (!input.isNewSession) return { status: "not_new" };
  const code = normalizeReferralCode(input.rawCode);
  if (!REFERRAL_CODE_PATTERN.test(code)) return { status: "not_found" };

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_referral_${input.referredChatId}`}))`;
    const [setting, referralCode, existing] = await Promise.all([
      tx.referralProgramSetting.findUnique({ where: { id: REFERRAL_SETTING_ID } }),
      tx.referralCode.findUnique({ where: { code } }),
      tx.referralAttribution.findUnique({
        where: { referredChatId: input.referredChatId },
      }),
    ]);
    if (!setting?.enabled) return { status: "disabled" } as const;
    if (!referralCode) return { status: "not_found" } as const;
    if (referralCode.ownerChatId === input.referredChatId) {
      return { status: "self" } as const;
    }
    if (existing) return { status: "already_used" } as const;

    const attribution = await tx.referralAttribution.create({
      data: {
        referralCodeId: referralCode.id,
        referralCodeSnapshot: referralCode.code,
        referrerChatId: referralCode.ownerChatId,
        referredChatId: input.referredChatId,
        referredUsername: input.identity?.buyerUsername ?? null,
        referredDisplayName: input.identity?.buyerDisplayName ?? null,
        pointsAwarded: setting.pointsPerJoin,
        newUserReward: setting.newUserReward,
      },
    });

    const updatedCode = await tx.referralCode.update({
      where: { id: referralCode.id },
      data: {
        pointBalance: { increment: setting.pointsPerJoin },
        totalPointsEarned: { increment: setting.pointsPerJoin },
      },
    });
    if (setting.newUserReward > 0) {
      await applyWalletTransaction(tx, {
        chatId: input.referredChatId,
        amount: setting.newUserReward,
        type: "REFERRAL_JOIN_BONUS",
        idempotencyKey: `referral-new-user:${attribution.id}`,
        identity: input.identity,
        actor: "system:referral",
        note: `Bonus join dari referral ${referralCode.code}`,
      });
    }

    await tx.telegramNotification.createMany({
      data: [
        {
          dedupeKey: `referral-reward:referrer:${attribution.id}`,
          chatId: referralCode.ownerChatId,
          kind: "REFERRAL_REWARD",
          messageText: JSON.stringify({
            role: "referrer",
            code: referralCode.code,
            points: setting.pointsPerJoin,
            pointBalance: updatedCode.pointBalance,
          }),
          priority: 20,
        },
        ...(setting.newUserReward > 0
          ? [{
              dedupeKey: `referral-reward:new-user:${attribution.id}`,
              chatId: input.referredChatId,
              kind: "REFERRAL_REWARD",
              messageText: JSON.stringify({
                role: "new_user",
                code: referralCode.code,
                amount: setting.newUserReward,
              }),
              priority: 20,
            }]
          : []),
      ],
      skipDuplicates: true,
    });
    return {
      status: "rewarded",
      pointsAwarded: setting.pointsPerJoin,
      newUserReward: setting.newUserReward,
    } as const;
  });
}

export type ReferralClaimResult =
  | { status: "claimed"; pointsSpent: number; rewardAmount: number; pointBalance: number }
  | { status: "no_code" | "not_configured" | "insufficient_points" };

export async function claimReferralReward(input: {
  chatId: string;
  idempotencyKey: string;
  identity?: BuyerIdentity;
}): Promise<ReferralClaimResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_referral_claim_${input.chatId}`}))`;
    const existingClaim = await tx.referralClaim.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existingClaim) {
      const code = await tx.referralCode.findUniqueOrThrow({
        where: { id: existingClaim.referralCodeId },
      });
      return {
        status: "claimed",
        pointsSpent: existingClaim.pointsSpent,
        rewardAmount: existingClaim.rewardAmount,
        pointBalance: code.pointBalance,
      } as const;
    }

    const [setting, code] = await Promise.all([
      tx.referralProgramSetting.findUnique({ where: { id: REFERRAL_SETTING_ID } }),
      tx.referralCode.findUnique({ where: { ownerChatId: input.chatId } }),
    ]);
    if (!code) return { status: "no_code" } as const;
    if (!setting || setting.claimRewardAmount <= 0 || setting.claimThresholdPoints <= 0) {
      return { status: "not_configured" } as const;
    }
    if (code.pointBalance < setting.claimThresholdPoints) {
      return { status: "insufficient_points" } as const;
    }

    const updatedCode = await tx.referralCode.update({
      where: { id: code.id },
      data: {
        pointBalance: { decrement: setting.claimThresholdPoints },
        totalPointsClaimed: { increment: setting.claimThresholdPoints },
        totalRewardClaimed: { increment: setting.claimRewardAmount },
      },
    });
    const claim = await tx.referralClaim.create({
      data: {
        referralCodeId: code.id,
        ownerChatId: input.chatId,
        pointsSpent: setting.claimThresholdPoints,
        rewardAmount: setting.claimRewardAmount,
        idempotencyKey: input.idempotencyKey,
      },
    });
    await applyWalletTransaction(tx, {
      chatId: input.chatId,
      amount: setting.claimRewardAmount,
      type: "REFERRAL_REWARD",
      idempotencyKey: `referral-claim-wallet:${claim.id}`,
      identity: input.identity,
      actor: "system:referral-claim",
      note: `Claim ${setting.claimThresholdPoints} poin referral`,
    });
    return {
      status: "claimed",
      pointsSpent: setting.claimThresholdPoints,
      rewardAmount: setting.claimRewardAmount,
      pointBalance: updatedCode.pointBalance,
    } as const;
  });
}
