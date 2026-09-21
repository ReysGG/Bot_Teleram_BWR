import { Prisma } from "@/generated/prisma/client";

export const MIN_BINANCE_UNIQUE_MICROS = 1;
export const MAX_BINANCE_UNIQUE_MICROS = 999;

export async function allocateBinanceInternalUniqueMicros(
  tx: Pick<Prisma.TransactionClient, "$executeRaw" | "binanceInternalPaymentAttempt">,
  baseUsdtMicros: number,
) {
  if (!Number.isSafeInteger(baseUsdtMicros) || baseUsdtMicros <= 0) {
    throw new Error("Nominal dasar USDT tidak valid.");
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('telegram_binance_internal_amounts'))`;
  const active = await tx.binanceInternalPaymentAttempt.findMany({
    where: {
      expectedUsdtMicros: {
        gte: BigInt(baseUsdtMicros + MIN_BINANCE_UNIQUE_MICROS),
        lte: BigInt(baseUsdtMicros + MAX_BINANCE_UNIQUE_MICROS),
      },
      status: { in: ["AWAITING_ORDER_ID", "VERIFYING", "VERIFIED"] },
    },
    select: { expectedUsdtMicros: true },
  });
  const used = new Set(active.map((item) => item.expectedUsdtMicros.toString()));
  for (let uniqueMicros = 1; uniqueMicros <= 999; uniqueMicros += 1) {
    const expectedUsdtMicros = BigInt(baseUsdtMicros + uniqueMicros);
    if (!used.has(expectedUsdtMicros.toString())) {
      return { uniqueMicros, expectedUsdtMicros };
    }
  }
  throw new Error("Slot nominal Binance Pay aktif sedang penuh. Coba beberapa saat lagi.");
}

export function parsePositiveUsdtMicros(value: unknown): bigint | null {
  const text = typeof value === "number" ? String(value) : value;
  if (typeof text !== "string" || !/^\d+(?:\.\d+)?$/.test(text.trim())) {
    return null;
  }
  const [whole, fraction = ""] = text.trim().split(".");
  if (fraction.slice(6).replace(/0/g, "")) return null;
  const micros =
    BigInt(whole) * 1_000_000n +
    BigInt((fraction.slice(0, 6) || "0").padEnd(6, "0"));
  return micros > 0n ? micros : null;
}
