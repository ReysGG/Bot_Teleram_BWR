import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: Pool;
};
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://invalid:invalid@127.0.0.1:5432/telegram_store";

function boundedInteger(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

// Keep one bounded pool per Node process. This prevents a burst of requests from
// opening unbounded PostgreSQL connections while still allowing concurrent users.
const poolMax = boundedInteger("DB_POOL_MAX", 20, 2, 80);
const poolMin = Math.min(
  boundedInteger("DB_POOL_MIN", 2, 0, 20),
  poolMax,
);

const pool =
  globalForPrisma.pgPool ??
  new Pool({
    connectionString,
    max: poolMax,
    min: poolMin,
    idleTimeoutMillis: boundedInteger(
      "DB_POOL_IDLE_TIMEOUT_MS",
      30_000,
      1_000,
      300_000,
    ),
    connectionTimeoutMillis: boundedInteger(
      "DB_POOL_CONNECTION_TIMEOUT_MS",
      5_000,
      500,
      30_000,
    ),
    maxUses: boundedInteger("DB_POOL_MAX_USES", 5_000, 100, 100_000),
    application_name: "independent-telegram-store",
  });

pool.on("error", (error) => {
  // Do not print connection strings or query parameters from driver errors.
  console.error("[Database pool] idle connection error", {
    code: (error as NodeJS.ErrnoException).code,
    message: error.message.slice(0, 240),
  });
});

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.pgPool = pool;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(pool),
    transactionOptions: {
      maxWait: boundedInteger("DB_TRANSACTION_MAX_WAIT_MS", 10_000, 1_000, 60_000),
      timeout: boundedInteger("DB_TRANSACTION_TIMEOUT_MS", 30_000, 5_000, 120_000),
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
