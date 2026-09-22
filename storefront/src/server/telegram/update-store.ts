import { prisma } from "@/server/db/prisma";
import { cleanError } from "@/server/utils/format";

const LEASE_MS = 2 * 60 * 1000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export async function claimTelegramUpdate(input: {
  updateId: number;
  chatId: string;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('telegram_update_claim'))",
    );
    const updateId = BigInt(input.updateId);
    const existing = await tx.telegramProcessedUpdate.findUnique({
      where: { updateId },
    });
    const now = new Date();

    if (!existing) {
      await tx.telegramProcessedUpdate.create({
        data: {
          updateId,
          chatId: input.chatId,
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          expiresAt: new Date(now.getTime() + RETENTION_MS),
        },
      });
      return true;
    }
    if (existing.status === "COMPLETED") return false;
    if (existing.status === "PROCESSING" && existing.leaseUntil > now) return false;

    await tx.telegramProcessedUpdate.update({
      where: { updateId },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        lastError: null,
      },
    });
    return true;
  });
}

export async function completeTelegramUpdate(updateId: number): Promise<void> {
  await prisma.telegramProcessedUpdate.update({
    where: { updateId: BigInt(updateId) },
    data: { status: "COMPLETED", leaseUntil: new Date() },
  });
}

export async function failTelegramUpdate(updateId: number, error: unknown): Promise<void> {
  await prisma.telegramProcessedUpdate.update({
    where: { updateId: BigInt(updateId) },
    data: { status: "FAILED", leaseUntil: new Date(), lastError: cleanError(error) },
  });
}
