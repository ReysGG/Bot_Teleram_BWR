import { Prisma } from "@/generated/prisma/client";
export const MIN_USDT_UNIQUE_MICROS = 1;
export const MAX_USDT_UNIQUE_MICROS = 999;
export function usdtMicrosToTokenUnits(micros: number | bigint, decimals: number) {
  const value = typeof micros === "bigint" ? micros : BigInt(micros);
  if (value <= 0n || !Number.isInteger(decimals) || decimals < 6 || decimals > 30) throw new Error("Nominal token tidak valid.");
  return value * 10n ** BigInt(decimals - 6);
}
export async function allocateUsdtBep20UniqueMicros(tx: Pick<Prisma.TransactionClient, "$executeRaw" | "usdtBep20Attempt">, baseUsdtMicros: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('telegram_usdt_bep20_amounts'))`;
  const active = await tx.usdtBep20Attempt.findMany({ where: { expectedUsdtMicros: { gte: BigInt(baseUsdtMicros + 1), lte: BigInt(baseUsdtMicros + 999) }, status: { in: ["AWAITING_TX_HASH", "VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"] } }, select: { expectedUsdtMicros: true } });
  const used = new Set(active.map((item) => item.expectedUsdtMicros.toString()));
  for (let uniqueMicros = 1; uniqueMicros <= 999; uniqueMicros += 1) { const expectedUsdtMicros = BigInt(baseUsdtMicros + uniqueMicros); if (!used.has(expectedUsdtMicros.toString())) return { uniqueMicros, expectedUsdtMicros }; }
  throw new Error("Slot nominal USDT aktif sedang penuh.");
}
