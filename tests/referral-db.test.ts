import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/server/db/prisma";
import {
  applyReferralOnFirstJoin,
  claimReferralReward,
  createOrUpdateReferralCode,
  setReferralProgramState,
} from "@/server/referral/service";

const databaseDescribe = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;
const chatIds = [
  `ref-owner-${randomUUID()}`,
  `ref-new-one-${randomUUID()}`,
  `ref-new-two-${randomUUID()}`,
];

databaseDescribe("referral join points and claims", () => {
  afterAll(async () => {
    await prisma.telegramNotification.deleteMany({ where: { chatId: { in: chatIds } } });
    await prisma.walletTransaction.deleteMany({ where: { walletChatId: { in: chatIds } } });
    await prisma.wallet.deleteMany({ where: { chatId: { in: chatIds } } });
    const codes = await prisma.referralCode.findMany({
      where: { ownerChatId: chatIds[0] },
      select: { id: true },
    });
    const codeIds = codes.map((item) => item.id);
    await prisma.referralClaim.deleteMany({ where: { referralCodeId: { in: codeIds } } });
    await prisma.referralAttribution.deleteMany({ where: { referralCodeId: { in: codeIds } } });
    await prisma.referralCode.deleteMany({ where: { id: { in: codeIds } } });
    await prisma.referralProgramSetting.deleteMany({ where: { id: "global" } });
    await prisma.$disconnect();
  });

  it("awards join points once and claims wallet reward idempotently", async () => {
    await setReferralProgramState({
      enabled: true,
      pointsPerJoin: 2,
      claimThresholdPoints: 4,
      claimRewardAmount: 5_000,
      newUserReward: 1_000,
      actor: "integration-test",
    });
    const code = await createOrUpdateReferralCode({
      chatId: chatIds[0],
      code: "POINT_TEST",
      identity: { buyerUsername: "pointowner" },
    });

    const first = await applyReferralOnFirstJoin({
      referredChatId: chatIds[1],
      rawCode: "ref_POINT_TEST",
      isNewSession: true,
      identity: { buyerUsername: "newone" },
    });
    const retry = await applyReferralOnFirstJoin({
      referredChatId: chatIds[1],
      rawCode: "POINT_TEST",
      isNewSession: true,
    });
    const second = await applyReferralOnFirstJoin({
      referredChatId: chatIds[2],
      rawCode: "POINT_TEST",
      isNewSession: true,
      identity: { buyerUsername: "newtwo" },
    });
    expect(first).toMatchObject({ status: "rewarded", pointsAwarded: 2 });
    expect(retry).toMatchObject({ status: "already_used" });
    expect(second).toMatchObject({ status: "rewarded", pointsAwarded: 2 });

    expect(
      await prisma.referralCode.findUniqueOrThrow({ where: { id: code.id } }),
    ).toMatchObject({ pointBalance: 4, totalPointsEarned: 4 });
    expect(
      await prisma.wallet.findUniqueOrThrow({ where: { chatId: chatIds[1] } }),
    ).toMatchObject({ balance: 1_000 });

    const idempotencyKey = `claim:${randomUUID()}`;
    const claimed = await claimReferralReward({
      chatId: chatIds[0],
      idempotencyKey,
      identity: { buyerUsername: "pointowner" },
    });
    const claimedRetry = await claimReferralReward({
      chatId: chatIds[0],
      idempotencyKey,
    });
    expect(claimed).toMatchObject({
      status: "claimed",
      pointsSpent: 4,
      rewardAmount: 5_000,
      pointBalance: 0,
    });
    expect(claimedRetry).toMatchObject({ status: "claimed", pointBalance: 0 });
    expect(
      await prisma.wallet.findUniqueOrThrow({ where: { chatId: chatIds[0] } }),
    ).toMatchObject({ balance: 5_000 });
    expect(await prisma.referralClaim.count({ where: { idempotencyKey } })).toBe(1);
    expect(
      await prisma.walletTransaction.count({
        where: { type: "REFERRAL_REWARD", walletChatId: chatIds[0] },
      }),
    ).toBe(1);
  }, 30_000);
});
