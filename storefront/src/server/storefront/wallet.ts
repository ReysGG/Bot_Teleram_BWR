import { prisma } from "@/server/db/prisma";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { webCustomerChatId } from "./customer-access";

export async function loadWebWallet(customerId: string, cursor?: string) {
  const walletChatId = webCustomerChatId(customerId);
  return prisma.$transaction(async tx => {
    if (cursor && !await tx.walletTransaction.findFirst({ where: { id: cursor, walletChatId }, select: { id: true } })) {
      throw new Error("Invalid wallet cursor");
    }
    const [wallet, rows, availability] = await Promise.all([
      tx.wallet.findUnique({ where: { chatId: walletChatId }, select: { balance: true } }),
      tx.walletTransaction.findMany({
        where: { walletChatId }, take: 26, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, type: true, amount: true, balanceAfter: true, createdAt: true,
          order: { select: { channel: true, webCustomerId: true, invoiceNumber: true } } },
      }),
      getPaymentMethodAvailability(tx),
    ]);
    return {
      balance: wallet?.balance ?? 0,
      walletEnabled: availability.walletCheckoutEnabled,
      mixedQrisEnabled: availability.walletCheckoutEnabled && availability.mixedWalletQrisEnabled && availability.qrisDanaEnabled,
      transactions: rows.slice(0, 25).map(row => ({
        id: row.id, type: row.type, amount: row.amount, balanceAfter: row.balanceAfter,
        createdAt: row.createdAt.toISOString(),
        invoiceNumber: row.order?.channel === "WEB" && row.order.webCustomerId === customerId ? row.order.invoiceNumber : null,
      })),
      nextCursor: rows.length > 25 ? rows[24].id : null,
    };
  }, { isolationLevel: "RepeatableRead" });
}
