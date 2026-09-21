import { randomInt } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import {
  UNIQUE_CODE_MAX,
  UNIQUE_CODE_MIN,
  selectAvailableUniqueCode,
  uniqueCodeCandidates,
} from "@/server/checkout/amount";
import { paymentAmountReservationCutoff } from "@/server/payment/window";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function lockPaymentAmountAllocation(
  tx: TransactionClient,
): Promise<void> {
  await tx.$executeRawUnsafe(
    "SELECT pg_advisory_xact_lock(hashtext('telegram_global_unique_code'))",
  );
}

export async function allocateUniqueCode(
  tx: TransactionClient,
  baseAmount: number,
): Promise<number> {
  if (!Number.isSafeInteger(baseAmount) || baseAmount <= 0) {
    throw new Error("Nominal dasar pembayaran tidak valid");
  }
  await lockPaymentAmountAllocation(tx);
  const now = new Date();
  const reservationCutoff = paymentAmountReservationCutoff(now);
  const [orderCodes, topupCodes] = await Promise.all([
    tx.payment.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: reservationCutoff },
        uniqueCode: { gte: UNIQUE_CODE_MIN, lte: UNIQUE_CODE_MAX },
      },
      select: { billedAmount: true },
    }),
    tx.walletTopup.findMany({
      where: {
        status: "PENDING",
        expiresAt: { gt: reservationCutoff },
        uniqueCode: { gte: UNIQUE_CODE_MIN, lte: UNIQUE_CODE_MAX },
      },
      select: { billedAmount: true },
    }),
  ]);
  const activeAmounts = new Set<number>();
  for (const item of [...orderCodes, ...topupCodes]) {
    activeAmounts.add(item.billedAmount);
  }

  const code = selectAvailableUniqueCode({
    candidates: uniqueCodeCandidates(
      randomInt(UNIQUE_CODE_MIN, UNIQUE_CODE_MAX + 1),
    ),
    baseAmount,
    activeAmounts,
  });
  if (code !== null) return code;
  throw new Error(
    "Semua 99 nominal aman untuk harga ini sedang dipakai. Tunggu invoice aktif lunas atau kedaluwarsa.",
  );
}
