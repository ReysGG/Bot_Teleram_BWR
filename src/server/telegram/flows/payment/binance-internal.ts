import { Prisma } from "@/generated/prisma/client";
import { normalizeOrderQuantity } from "@/server/checkout/order-quantity";
import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import {
  BinanceInternalError,
  createBinanceInternalOrder,
  getBinanceInternalAttemptForOrder,
  refreshBinanceInternalVerification,
  submitBinanceInternalOrderId,
} from "@/server/payment/binance-internal";
import type { InlineKeyboard } from "@/server/telegram/api";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import type { TelegramLocale } from "@/server/telegram/i18n";
import type { PendingBinanceOrderId, TelegramUser } from "@/server/telegram/types";
import {
  binanceInternalButtonText,
  binanceInternalCopyButtons,
  binanceInternalInvoiceText,
  binanceInternalOrderIdPromptText,
  binanceInternalPublicErrorText,
  binanceInternalStatusText,
  type BinanceInternalPublicStatus,
} from "./binance-internal-presentation";

type NavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
  invoiceOrderId?: string;
}) => Promise<{ message_id: number }>;

function parsePendingOrderId(
  value: Prisma.JsonValue | null,
): PendingBinanceOrderId | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return typeof value.orderId === "string" && typeof value.messageId === "number"
    ? { orderId: value.orderId, messageId: value.messageId }
    : null;
}

function microsAsNumber(value: bigint): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Nominal USDT tidak valid");
  }
  return amount;
}

function attemptButtons(input: {
  locale: TelegramLocale;
  orderId: string;
  status: BinanceInternalPublicStatus;
  recipientBinanceId: string;
  amountUsdtMicros: number;
}): InlineKeyboard {
  const rows: InlineKeyboard["inline_keyboard"] = [];
  if (input.status === "AWAITING_ORDER_ID") {
    rows.push(binanceInternalCopyButtons(input));
    rows.push([{
      text: binanceInternalButtonText(input.locale, "transferred"),
      callback_data: `binance_transferred:${input.orderId}`,
    }]);
  }
  if (input.status === "VERIFYING" || input.status === "VERIFIED") {
    rows.push([{
      text: binanceInternalButtonText(input.locale, "refresh"),
      callback_data: `binance_refresh:${input.orderId}`,
    }]);
  }
  rows.push([{
    text: binanceInternalButtonText(input.locale, "order"),
    callback_data: `order:${input.orderId}`,
  }]);
  if (input.status === "AWAITING_ORDER_ID" || input.status === "REJECTED") {
    rows.push([{
      text: binanceInternalButtonText(input.locale, "cancel"),
      callback_data: `cancel_order:${input.orderId}`,
    }]);
  }
  rows.push([{
    text: binanceInternalButtonText(input.locale, "backCatalog"),
    callback_data: "catalog",
  }]);
  return { inline_keyboard: rows };
}

export function createBinanceInternalTelegramFlow(deps: {
  renderNavigationMessage: NavigationRenderer;
}) {
  async function showAttempt(chatId: string, orderId: string, messageId?: number) {
    const [attempt, locale] = await Promise.all([
      getBinanceInternalAttemptForOrder({ orderId, chatId }),
      telegramLocaleForChat(chatId),
    ]);
    const productName = attempt.order.items[0]?.productNameSnapshot ??
      (locale === "en" ? "Digital product" : "Produk digital");
    const quantity = attempt.order.items.reduce((sum, item) => sum + item.quantity, 0);
    const sent = await deps.renderNavigationMessage({
      chatId,
      messageId: attempt.order.payment?.telegramInvoiceMessageId ?? messageId,
      invoiceOrderId: attempt.orderId,
      text: [
        binanceInternalInvoiceText({
          locale,
          invoiceNumber: attempt.order.invoiceNumber,
          productName,
          quantity,
          amountUsdtMicros: microsAsNumber(attempt.expectedUsdtMicros),
          recipientBinanceId: attempt.recipientBinanceIdSnapshot,
          expiresAt: attempt.expiresAt,
        }),
        "",
        binanceInternalStatusText({
          locale,
          status: attempt.status,
          submittedOrderId: attempt.submittedOrderId,
        }),
      ].join("\n"),
      replyMarkup: attemptButtons({
        locale,
        orderId: attempt.orderId,
        status: attempt.status,
        recipientBinanceId: attempt.recipientBinanceIdSnapshot,
        amountUsdtMicros: microsAsNumber(attempt.expectedUsdtMicros),
      }),
    });
    if (attempt.order.payment?.telegramInvoiceMessageId !== sent.message_id) {
      await prisma.payment.update({
        where: { orderId: attempt.orderId },
        data: { telegramInvoiceMessageId: sent.message_id },
      });
    }
  }

  async function resetSession(chatId: string) {
    await prisma.botSession.updateMany({
      where: { chatId },
      data: { state: "BROWSING", cart: Prisma.JsonNull },
    });
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
      const order = await createBinanceInternalOrder({
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

    async promptForOrderId(chatId: string, orderId: string, messageId: number) {
      const [attempt, locale] = await Promise.all([
        getBinanceInternalAttemptForOrder({ orderId, chatId }),
        telegramLocaleForChat(chatId),
      ]);
      if (attempt.status !== "AWAITING_ORDER_ID") {
        await showAttempt(chatId, orderId, messageId);
        return;
      }
      await prisma.botSession.upsert({
        where: { chatId },
        create: { chatId, state: "AWAITING_BINANCE_ORDER_ID", cart: { orderId, messageId } },
        update: { state: "AWAITING_BINANCE_ORDER_ID", cart: { orderId, messageId } },
      });
      const sent = await deps.renderNavigationMessage({
        chatId,
        messageId,
        text: binanceInternalOrderIdPromptText(locale, attempt.order.invoiceNumber),
        replyMarkup: {
          inline_keyboard: [
            [{ text: binanceInternalButtonText(locale, "backPayment"), callback_data: `binance_invoice:${orderId}` }],
            [{ text: binanceInternalButtonText(locale, "cancel"), callback_data: `cancel_order:${orderId}` }],
            [{ text: binanceInternalButtonText(locale, "order"), callback_data: `order:${orderId}` }],
          ],
        },
      });
      if (sent.message_id !== messageId) {
        await prisma.botSession.update({
          where: { chatId },
          data: { cart: { orderId, messageId: sent.message_id } },
        });
      }
    },

    async submitOrderId(input: {
      chatId: string;
      text: string;
      cart: Prisma.JsonValue | null;
    }) {
      const pending = parsePendingOrderId(input.cart);
      if (!pending) {
        await resetSession(input.chatId);
        return;
      }
      const [attempt, locale] = await Promise.all([
        getBinanceInternalAttemptForOrder({ orderId: pending.orderId, chatId: input.chatId }),
        telegramLocaleForChat(input.chatId),
      ]);
      try {
        await submitBinanceInternalOrderId({
          orderId: pending.orderId,
          chatId: input.chatId,
          submittedOrderId: input.text,
        });
        await resetSession(input.chatId);
        await showAttempt(input.chatId, pending.orderId, pending.messageId);
      } catch (error) {
        if (
          error instanceof BinanceInternalError &&
          (error.code === "INVALID_ORDER_ID" || error.code === "ORDER_ID_ALREADY_USED")
        ) {
          await deps.renderNavigationMessage({
            chatId: input.chatId,
            messageId: pending.messageId,
            text: `❌ ${binanceInternalPublicErrorText(locale, error.code)}\n\n${binanceInternalOrderIdPromptText(locale, attempt.order.invoiceNumber)}`,
            replyMarkup: {
              inline_keyboard: [[{
                text: binanceInternalButtonText(locale, "backPayment"),
                callback_data: `binance_invoice:${pending.orderId}`,
              }]],
            },
          });
          return;
        }
        await resetSession(input.chatId);
        if (error instanceof BinanceInternalError && error.code === "ORDER_ID_ALREADY_SUBMITTED") {
          await showAttempt(input.chatId, pending.orderId, pending.messageId);
          return;
        }
        if (error instanceof BinanceInternalError) {
          await deps.renderNavigationMessage({
            chatId: input.chatId,
            messageId: pending.messageId,
            text: `❌ ${binanceInternalPublicErrorText(locale, error.code)}`,
            replyMarkup: {
              inline_keyboard: [
                [{ text: binanceInternalButtonText(locale, "order"), callback_data: `order:${pending.orderId}` }],
                [{ text: binanceInternalButtonText(locale, "backOrders"), callback_data: "orders" }],
              ],
            },
          });
          return;
        }
        throw error;
      }
    },

    async refresh(chatId: string, orderId: string, messageId: number) {
      try {
        await refreshBinanceInternalVerification({ orderId, chatId });
        await showAttempt(chatId, orderId, messageId);
      } catch (error) {
        if (!(error instanceof BinanceInternalError)) throw error;
        const locale = await telegramLocaleForChat(chatId);
        await deps.renderNavigationMessage({
          chatId,
          messageId,
          text: `❌ ${binanceInternalPublicErrorText(locale, error.code)}`,
          replyMarkup: {
            inline_keyboard: [
              [{ text: binanceInternalButtonText(locale, "order"), callback_data: `order:${orderId}` }],
              [{ text: binanceInternalButtonText(locale, "backOrders"), callback_data: "orders" }],
            ],
          },
        });
      }
    },

    async rejectDocument(chatId: string, cart: Prisma.JsonValue | null) {
      const pending = parsePendingOrderId(cart);
      if (!pending) return;
      const [attempt, locale] = await Promise.all([
        getBinanceInternalAttemptForOrder({ orderId: pending.orderId, chatId }),
        telegramLocaleForChat(chatId),
      ]);
      await deps.renderNavigationMessage({
        chatId,
        messageId: pending.messageId,
        text: [
          locale === "en"
            ? "❌ Send the Binance Order ID as text, not a file or screenshot."
            : "❌ Kirim Order ID Binance sebagai teks, bukan file atau screenshot.",
          "",
          binanceInternalOrderIdPromptText(locale, attempt.order.invoiceNumber),
        ].join("\n"),
        replyMarkup: {
          inline_keyboard: [[{
            text: binanceInternalButtonText(locale, "backPayment"),
            callback_data: `binance_invoice:${pending.orderId}`,
          }]],
        },
      });
    },
  };
}
