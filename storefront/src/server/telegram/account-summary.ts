import { prisma } from "@/server/db/prisma";

export type TelegramAccountSummary = {
  chatId: string;
  username: string | null;
  displayName: string | null;
  walletBalance: number;
  completedOrders: number;
  totalSpent: number;
  notificationsEnabled: boolean;
};

export async function loadTelegramAccountSummary(
  chatId: string,
): Promise<TelegramAccountSummary> {
  const [session, wallet, completedOrders] = await Promise.all([
    prisma.botSession.findUnique({
      where: { chatId },
      select: {
        buyerUsername: true,
        buyerDisplayName: true,
        broadcastEnabled: true,
      },
    }),
    prisma.wallet.findUnique({
      where: { chatId },
      select: { balance: true },
    }),
    prisma.order.aggregate({
      where: { chatId, status: "COMPLETED" },
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
  ]);

  return {
    chatId,
    username: session?.buyerUsername ?? null,
    displayName: session?.buyerDisplayName ?? null,
    walletBalance: wallet?.balance ?? 0,
    completedOrders: completedOrders._count._all,
    totalSpent: completedOrders._sum.grandTotal ?? 0,
    notificationsEnabled: session?.broadcastEnabled ?? true,
  };
}
