import { Prisma } from "@/generated/prisma/client";
import { normalizeOrderQuantity } from "@/server/checkout/order-quantity";
import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import { formatUsdtMicrosForInput } from "@/server/payment/usdt-amount";
import {
  createUsdtBep20Order,
  getUsdtBep20AttemptForOrder,
  refreshUsdtBep20Verification,
  submitUsdtBep20Transaction,
  UsdtBep20Error,
} from "@/server/payment/usdt-bep20";
import { createUsdtBep20AddressQr } from "@/server/payment/usdt-bep20-qr";
import { normalizeEvmAddress } from "@/server/payment/usdt-bep20-setting";
import type { InlineKeyboard } from "@/server/telegram/api";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import type { TelegramLocale } from "@/server/telegram/i18n";
import type { PendingUsdtTransactionHash, TelegramUser } from "@/server/telegram/types";
import {
  usdtBep20ButtonText,
  usdtBep20HashPromptText,
  usdtBep20InvoiceText,
  usdtBep20PublicErrorText,
  usdtBep20StatusText,
  type UsdtBep20PublicStatus,
} from "./usdt-bep20-presentation";

type NavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
  invoiceOrderId?: string;
  photoBuffer?: {
    filename: string;
    png: Buffer;
    reuseExistingPhoto?: boolean;
  };
}) => Promise<{ message_id: number }>;

type FlowDependencies = {
  renderNavigationMessage: NavigationRenderer;
};

function parsePendingHash(
  value: Prisma.JsonValue | null,
): PendingUsdtTransactionHash | null {
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
  status: UsdtBep20PublicStatus;
  recipientAddress: string;
  amountUsdtMicros: number;
}): InlineKeyboard {
  const rows: InlineKeyboard["inline_keyboard"] = [];
  rows.push([
    {
      text: input.locale === "en" ? "📋 Copy address" : "📋 Salin alamat",
      copy_text: { text: input.recipientAddress },
    },
    {
      text: input.locale === "en" ? "💵 Copy amount" : "💵 Salin nominal",
      copy_text: {
        text: formatUsdtMicrosForInput(input.amountUsdtMicros),
      },
    },
  ]);
  if (input.status === "AWAITING_TX_HASH") {
    rows.push([{
      text: usdtBep20ButtonText(input.locale, "transferred"),
      callback_data: `usdt_transferred:${input.orderId}`,
    }]);
  }
  if (["VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"].includes(input.status)) {
    rows.push([{
      text: usdtBep20ButtonText(input.locale, "refresh"),
      callback_data: `usdt_refresh:${input.orderId}`,
    }]);
  }
  rows.push([{
    text: usdtBep20ButtonText(input.locale, "order"),
    callback_data: `order:${input.orderId}`,
  }]);
  if (input.status === "AWAITING_TX_HASH" || input.status === "REJECTED") {
    rows.push([{
      text: usdtBep20ButtonText(input.locale, "cancel"),
      callback_data: `cancel_order:${input.orderId}`,
    }]);
  }
  rows.push([{
    text: usdtBep20ButtonText(input.locale, "backCatalog"),
    callback_data: "catalog",
  }]);
  return { inline_keyboard: rows };
}

export function createUsdtBep20TelegramFlow(deps: FlowDependencies) {
  async function showAttempt(
    chatId: string,
    orderId: string,
    messageId?: number,
  ) {
    const [attempt, locale] = await Promise.all([
      getUsdtBep20AttemptForOrder({ orderId, chatId }),
      telegramLocaleForChat(chatId),
    ]);
    const productName = attempt.order.items[0]?.productNameSnapshot ?? "Produk digital";
    const quantity = attempt.order.items.reduce((sum, item) => sum + item.quantity, 0);
    const statusText = usdtBep20StatusText({
      locale,
      status: attempt.status,
      transactionHash: attempt.txHash,
      confirmations: attempt.confirmations,
      requiredConfirmations: attempt.requiredConfirmationsSnapshot,
    });
    const recipientAddress = normalizeEvmAddress(
      attempt.recipientAddressSnapshot,
    );
    let qrPng: Buffer | null = null;
    try {
      qrPng = await createUsdtBep20AddressQr(
        recipientAddress,
      );
    } catch {
      // Payment instructions remain available as text if local QR rendering fails.
    }
    const existingInvoiceMessageId =
      attempt.order.payment?.telegramInvoiceMessageId ?? undefined;
    const sent = await deps.renderNavigationMessage({
      chatId,
      messageId: attempt.order.payment?.telegramInvoiceMessageId ?? messageId,
      invoiceOrderId: attempt.orderId,
      ...(qrPng
        ? {
            photoBuffer: {
              filename: `${attempt.order.invoiceNumber}-USDT-BEP20.png`,
              png: qrPng,
              reuseExistingPhoto: Boolean(
                messageId && existingInvoiceMessageId === messageId,
              ),
            },
          }
        : {}),
      text: [
        usdtBep20InvoiceText({
          locale,
          invoiceNumber: attempt.order.invoiceNumber,
          productName,
          quantity,
          amountUsdtMicros: microsAsNumber(attempt.expectedUsdtMicros),
          recipientAddress,
          expiresAt: attempt.expiresAt,
        }),
        "",
        statusText,
      ].join("\n"),
      replyMarkup: attemptButtons({
        locale,
        orderId: attempt.orderId,
        status: attempt.status,
        recipientAddress,
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
        create: {
          chatId: input.chatId,
          state: "BROWSING",
          ...identity,
          checkoutKey: input.idempotencyKey,
        },
        update: {
          state: "BROWSING",
          cart: Prisma.JsonNull,
          ...identity,
          checkoutKey: input.idempotencyKey,
        },
      });
      const order = await createUsdtBep20Order({
        chatId: input.chatId,
        productId: input.productId,
        idempotencyKey: input.idempotencyKey,
        quantity,
        ...identity,
      });
      await prisma.botSession.update({
        where: { chatId: input.chatId },
        data: {
          state: "BROWSING",
          activeOrderId: order.id,
          cart: Prisma.JsonNull,
          checkoutKey: null,
        },
      });
      await showAttempt(input.chatId, order.id, input.messageId);
    },

    async promptForHash(chatId: string, orderId: string, messageId: number) {
      const [attempt, locale] = await Promise.all([
        getUsdtBep20AttemptForOrder({ orderId, chatId }),
        telegramLocaleForChat(chatId),
      ]);
      if (attempt.status !== "AWAITING_TX_HASH") {
        await showAttempt(chatId, orderId, messageId);
        return;
      }
      await prisma.botSession.upsert({
        where: { chatId },
        create: {
          chatId,
          state: "AWAITING_USDT_TX_HASH",
          cart: { orderId, messageId },
        },
        update: {
          state: "AWAITING_USDT_TX_HASH",
          cart: { orderId, messageId },
        },
      });
      const sent = await deps.renderNavigationMessage({
        chatId,
        messageId,
        text: usdtBep20HashPromptText(locale, attempt.order.invoiceNumber),
        replyMarkup: {
          inline_keyboard: [
            [{
              text: usdtBep20ButtonText(locale, "backPayment"),
              callback_data: `usdt_invoice:${orderId}`,
            }],
            [{
              text: usdtBep20ButtonText(locale, "cancel"),
              callback_data: `cancel_order:${orderId}`,
            }],
            [{
              text: usdtBep20ButtonText(locale, "order"),
              callback_data: `order:${orderId}`,
            }],
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

    async submitHash(input: {
      chatId: string;
      text: string;
      cart: Prisma.JsonValue | null;
    }) {
      const pending = parsePendingHash(input.cart);
      if (!pending) {
        await resetSession(input.chatId);
        return;
      }
      const [attempt, locale] = await Promise.all([
        getUsdtBep20AttemptForOrder({ orderId: pending.orderId, chatId: input.chatId }),
        telegramLocaleForChat(input.chatId),
      ]);
      try {
        await submitUsdtBep20Transaction({
          orderId: pending.orderId,
          chatId: input.chatId,
          txHash: input.text,
        });
        await resetSession(input.chatId);
        await showAttempt(input.chatId, pending.orderId, pending.messageId);
      } catch (error) {
        if (
          error instanceof UsdtBep20Error &&
          (error.code === "INVALID_TX_HASH" || error.code === "TX_HASH_ALREADY_USED")
        ) {
          await deps.renderNavigationMessage({
            chatId: input.chatId,
            messageId: pending.messageId,
            text: `❌ ${usdtBep20PublicErrorText(locale, error.code)}\n\n${usdtBep20HashPromptText(locale, attempt.order.invoiceNumber)}`,
            replyMarkup: {
              inline_keyboard: [[{
                text: usdtBep20ButtonText(locale, "backPayment"),
                callback_data: `usdt_invoice:${pending.orderId}`,
              }]],
            },
          });
          return;
        }
        await resetSession(input.chatId);
        if (
          error instanceof UsdtBep20Error &&
          error.code === "TX_HASH_ALREADY_SUBMITTED"
        ) {
          await showAttempt(input.chatId, pending.orderId, pending.messageId);
          return;
        }
        if (error instanceof UsdtBep20Error) {
          await deps.renderNavigationMessage({
            chatId: input.chatId,
            messageId: pending.messageId,
            text: `❌ ${usdtBep20PublicErrorText(locale, error.code)}`,
            replyMarkup: {
              inline_keyboard: [
                [{
                  text: usdtBep20ButtonText(locale, "order"),
                  callback_data: `order:${pending.orderId}`,
                }],
                [{
                  text: usdtBep20ButtonText(locale, "backOrders"),
                  callback_data: "orders",
                }],
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
        await refreshUsdtBep20Verification({ orderId, chatId });
        await showAttempt(chatId, orderId, messageId);
      } catch (error) {
        if (!(error instanceof UsdtBep20Error)) throw error;
        const locale = await telegramLocaleForChat(chatId);
        await deps.renderNavigationMessage({
          chatId,
          messageId,
          text: `❌ ${usdtBep20PublicErrorText(locale, error.code)}`,
          replyMarkup: {
            inline_keyboard: [
              [{
                text: usdtBep20ButtonText(locale, "order"),
                callback_data: `order:${orderId}`,
              }],
              [{
                text: usdtBep20ButtonText(locale, "backOrders"),
                callback_data: "orders",
              }],
            ],
          },
        });
      }
    },

    async rejectDocument(chatId: string, cart: Prisma.JsonValue | null) {
      const pending = parsePendingHash(cart);
      if (!pending) return;
      const [attempt, locale] = await Promise.all([
        getUsdtBep20AttemptForOrder({ orderId: pending.orderId, chatId }),
        telegramLocaleForChat(chatId),
      ]);
      await deps.renderNavigationMessage({
        chatId,
        messageId: pending.messageId,
        text: [
          locale === "en"
            ? "❌ Send the transaction hash as text, not a file or screenshot."
            : "❌ Kirim transaction hash sebagai teks, bukan file atau screenshot.",
          "",
          usdtBep20HashPromptText(locale, attempt.order.invoiceNumber),
        ].join("\n"),
        replyMarkup: {
          inline_keyboard: [[{
            text: usdtBep20ButtonText(locale, "backPayment"),
            callback_data: `usdt_invoice:${pending.orderId}`,
          }]],
        },
      });
    },
  };
}
