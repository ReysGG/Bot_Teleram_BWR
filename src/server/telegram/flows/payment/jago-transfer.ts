import { Prisma } from "@/generated/prisma/client";
import { normalizeOrderQuantity } from "@/server/checkout/order-quantity";
import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import {
  createJagoTransferOrder,
  getJagoTransferAttemptForOrder,
} from "@/server/payment/jago-transfer";
import type { InlineKeyboard } from "@/server/telegram/api";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import type { TelegramUser } from "@/server/telegram/types";
import {
  jagoTransferCopyButtonRow,
  jagoTransferInvoiceText,
  jagoTransferStatusText,
} from "./jago-transfer-presentation";

type NavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
  invoiceOrderId?: string;
}) => Promise<{ message_id: number }>;

export function createJagoTransferTelegramFlow(deps: {
  renderNavigationMessage: NavigationRenderer;
}) {
  async function showAttempt(chatId: string, orderId: string, messageId?: number) {
    const [attempt, locale] = await Promise.all([
      getJagoTransferAttemptForOrder({ orderId, chatId }),
      telegramLocaleForChat(chatId),
    ]);
    const payment = attempt.order.payment;
    if (!payment) throw new Error("Pembayaran Bank Jago tidak ditemukan");
    const productName = attempt.order.items[0]?.productNameSnapshot ?? "Produk digital";
    const quantity = attempt.order.items.reduce((sum, item) => sum + item.quantity, 0);
    const sent = await deps.renderNavigationMessage({
      chatId,
      messageId: attempt.order.payment?.telegramInvoiceMessageId ?? messageId,
      invoiceOrderId: attempt.orderId,
      text: [
        jagoTransferInvoiceText({
          locale,
          invoiceNumber: attempt.order.invoiceNumber,
          productName,
          quantity,
          billedAmount: payment.billedAmount,
          recipientAccountNumber: attempt.recipientAccountNumberSnapshot,
          expiresAt: attempt.expiresAt,
        }),
        "",
        jagoTransferStatusText({ locale, status: attempt.status }),
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [
          ...(attempt.status === "AWAITING_TRANSFER"
            ? [jagoTransferCopyButtonRow({
                locale,
                recipientAccountNumber: attempt.recipientAccountNumberSnapshot,
                billedAmount: payment.billedAmount,
              })]
            : []),
          [{ text: locale === "en" ? "🔄 Refresh payment" : "🔄 Refresh pembayaran", callback_data: `jago_invoice:${orderId}` }],
          [{ text: locale === "en" ? "📦 View order" : "📦 Lihat order", callback_data: `order:${orderId}` }],
          ...(attempt.status === "AWAITING_TRANSFER"
            ? [[{ text: locale === "en" ? "❌ Cancel payment" : "❌ Batalkan pembayaran", callback_data: `cancel_order:${orderId}` }]]
            : []),
          [{ text: locale === "en" ? "⬅️ Back to catalog" : "⬅️ Kembali ke katalog", callback_data: "catalog" }],
        ],
      },
    });
    if (payment.telegramInvoiceMessageId !== sent.message_id) {
      await prisma.payment.update({
        where: { orderId },
        data: { telegramInvoiceMessageId: sent.message_id },
      });
    }
  }

  return {
    showAttempt,

    async startCheckout(input: {
      chatId: string;
      productId: string;
      user: TelegramUser;
      idempotencyKey: string;
      quantity: number;
      messageId?: number;
    }) {
      const quantity = normalizeOrderQuantity(input.quantity);
      const identity = normalizeBuyerIdentity({
        username: input.user.username,
        firstName: input.user.first_name,
        lastName: input.user.last_name,
      });
      await prisma.botSession.upsert({
        where: { chatId: input.chatId },
        create: { chatId: input.chatId, state: "BROWSING", ...identity, checkoutKey: input.idempotencyKey },
        update: { state: "BROWSING", cart: Prisma.JsonNull, ...identity, checkoutKey: input.idempotencyKey },
      });
      const order = await createJagoTransferOrder({
        chatId: input.chatId,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
        quantity,
        ...identity,
      });
      await prisma.botSession.update({
        where: { chatId: input.chatId },
        data: { state: "BROWSING", activeOrderId: order.id, cart: Prisma.JsonNull, checkoutKey: null },
      });
      await showAttempt(input.chatId, order.id, input.messageId);
    },
  };
}
