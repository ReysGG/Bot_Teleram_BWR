import { prisma } from "@/server/db/prisma";

// Older navigation could reuse one bubble for more than one invoice. Only
// replace a uniquely owned invoice, never another order's invoice or document.
export async function invoiceMessageIdForDelivery(order: { id: string; chatId: string; payment?: { telegramInvoiceMessageId: number | null } | null }) {
  const messageId = order.payment?.telegramInvoiceMessageId;
  if (!messageId) return null;
  const references = await prisma.payment.findMany({
    where: { telegramInvoiceMessageId: messageId, order: { chatId: order.chatId } },
    select: { orderId: true }, take: 2,
  });
  if (references.length !== 1 || references[0].orderId !== order.id) return null;
  const otherDelivery = await prisma.sentDelivery.findFirst({
    where: { chatId: order.chatId, telegramMessageId: String(messageId), orderId: { not: order.id } }, select: { id: true },
  });
  return otherDelivery ? null : messageId;
}
