import { prisma } from "@/server/db/prisma";

type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function lockOrderPaymentTransition(
  tx: TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_payment_${orderId}`}))`;
}
