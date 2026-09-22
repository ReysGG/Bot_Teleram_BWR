import { prisma } from "@/server/db/prisma";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import { getJagoTransferCheckoutConfig } from "@/server/payment/jago-transfer";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import {
  getQrisCheckoutSummary,
  renderQrisInvoice,
} from "@/server/payment/qris-invoice";
import {
  sendPhotoBuffer,
  type InlineKeyboard,
} from "@/server/telegram/api";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import type { TelegramUser } from "@/server/telegram/types";
import { formatRupiah } from "@/server/utils/format";
import {
  createWalletTopup,
  WALLET_TOPUP_PRESETS,
  type WalletTopupPaymentMethod,
} from "@/server/wallet/topup";
import {
  resolveWalletTopupProviderAvailability,
  TELEGRAM_DANA_TOPUP_METHOD,
  TELEGRAM_JAGO_TOPUP_METHOD,
  walletTopupAmountCallback,
  walletTopupEntryStep,
  walletTopupJagoInvoice,
  walletTopupQrisInvoice,
  walletTopupProviderCallback,
  walletTopupProviderLabel,
  type TelegramWalletTopupMethod,
} from "./wallet-topup-presentation";

type NavigationRenderer = (input: {
  chatId: string;
  text: string;
  replyMarkup?: InlineKeyboard;
  messageId?: number;
  photoBuffer?: {
    filename: string;
    png: Buffer;
    reuseExistingPhoto?: boolean;
  } | null;
}) => Promise<{ message_id: number }>;

export async function getWalletTopupProviderAvailability() {
  const [paymentMethods, qris, jago] = await Promise.all([
    getPaymentMethodAvailability(),
    getQrisCheckoutSummary(),
    getJagoTransferCheckoutConfig(),
  ]);
  return resolveWalletTopupProviderAvailability({
    paymentMethods,
    qrisReady: qris.ready,
    qrisProviderKey: qris.providerKey,
    jagoReady: jago.enabled && Boolean(jago.accountNumber),
  });
}

function isProviderAvailable(
  providers: TelegramWalletTopupMethod[],
  paymentMethod: TelegramWalletTopupMethod,
) {
  return providers.includes(paymentMethod);
}

export function createWalletTopupTelegramFlow(deps: {
  renderNavigationMessage: NavigationRenderer;
}) {
  async function showUnavailable(chatId: string, messageId?: number) {
    const locale = await telegramLocaleForChat(chatId);
    await deps.renderNavigationMessage({
      chatId,
      messageId,
      text: locale === "en"
        ? "ℹ️ Wallet top up is currently unavailable."
        : "ℹ️ Top up wallet sedang tidak tersedia.",
      replyMarkup: {
        inline_keyboard: [[{
          text: locale === "en" ? "⬅️ Back" : "⬅️ Kembali",
          callback_data: "wallet",
        }]],
      },
    });
  }

  async function showAmounts(
    chatId: string,
    paymentMethod: TelegramWalletTopupMethod,
    messageId?: number,
  ) {
    const [availability, locale] = await Promise.all([
      getWalletTopupProviderAvailability(),
      telegramLocaleForChat(chatId),
    ]);
    if (!isProviderAvailable(availability.providers, paymentMethod)) {
      await showUnavailable(chatId, messageId);
      return;
    }
    const hasMultipleProviders = availability.providers.length > 1;
    await deps.renderNavigationMessage({
      chatId,
      messageId,
      text: locale === "en"
        ? `➕ Select a wallet top-up amount via ${walletTopupProviderLabel(locale, paymentMethod, availability.qrisProviderKey)}. The unique code is only Rp1-Rp99.`
        : `➕ Pilih nominal top up via ${walletTopupProviderLabel(locale, paymentMethod, availability.qrisProviderKey)}. Kode unik hanya Rp1-Rp99 dan saldo masuk tetap nominal dasarnya.`,
      replyMarkup: {
        inline_keyboard: [
          ...WALLET_TOPUP_PRESETS.map((amount) => [{
            text: `💳 ${formatRupiah(amount)}`,
            callback_data: walletTopupAmountCallback(paymentMethod, amount),
          }]),
          [{
            text: hasMultipleProviders
              ? (locale === "en" ? "⬅️ Change method" : "⬅️ Ganti metode")
              : (locale === "en" ? "⬅️ Back to wallet" : "⬅️ Kembali ke wallet"),
            callback_data: hasMultipleProviders ? "topup" : "wallet",
          }],
        ],
      },
    });
  }

  async function showOptions(chatId: string, messageId?: number) {
    const [availability, locale] = await Promise.all([
      getWalletTopupProviderAvailability(),
      telegramLocaleForChat(chatId),
    ]);
    const step = walletTopupEntryStep(availability);
    if (step.kind === "unavailable") {
      await showUnavailable(chatId, messageId);
      return;
    }
    if (step.kind === "amount") {
      await showAmounts(chatId, step.paymentMethod, messageId);
      return;
    }
    await deps.renderNavigationMessage({
      chatId,
      messageId,
      text: locale === "en"
        ? "➕ Select a wallet top-up payment method."
        : "➕ Pilih metode pembayaran top up wallet.",
      replyMarkup: {
        inline_keyboard: [
          [{
            text: `📱 ${walletTopupProviderLabel(locale, TELEGRAM_DANA_TOPUP_METHOD, availability.qrisProviderKey)}`,
            callback_data: walletTopupProviderCallback(TELEGRAM_DANA_TOPUP_METHOD),
          }],
          [{
            text: locale === "en" ? "🏦 Bank Jago transfer" : "🏦 Transfer Bank Jago",
            callback_data: walletTopupProviderCallback(TELEGRAM_JAGO_TOPUP_METHOD),
          }],
          [{
            text: locale === "en" ? "⬅️ Back to wallet" : "⬅️ Kembali ke wallet",
            callback_data: "wallet",
          }],
        ],
      },
    });
  }

  async function start(input: {
    chatId: string;
    amount: number;
    paymentMethod: TelegramWalletTopupMethod;
    user: TelegramUser;
    idempotencyKey: string;
    messageId?: number;
  }) {
    const identity = normalizeBuyerIdentity({
      username: input.user.username,
      firstName: input.user.first_name,
      lastName: input.user.last_name,
    });
    const paymentMethod: WalletTopupPaymentMethod = input.paymentMethod;
    const [topup, locale] = await Promise.all([
      createWalletTopup({
        chatId: input.chatId,
        amount: input.amount,
        paymentMethod,
        idempotencyKey: input.idempotencyKey,
        ...identity,
      }),
      telegramLocaleForChat(input.chatId),
    ]);

    if (input.paymentMethod === TELEGRAM_JAGO_TOPUP_METHOD) {
      const attempt = topup.jagoTransferAttempt;
      if (!attempt) {
        throw new Error("Top up wallet melalui Bank Jago sedang tidak tersedia.");
      }
      const invoice = walletTopupJagoInvoice({
        locale,
        invoiceNumber: topup.invoiceNumber,
        baseAmount: topup.baseAmount,
        uniqueCode: topup.uniqueCode,
        billedAmount: topup.billedAmount,
        recipientAccountNumber: attempt.recipientAccountNumberSnapshot,
        expiresAt: topup.expiresAt,
      });
      const sent = await deps.renderNavigationMessage({
        chatId: input.chatId,
        messageId: input.messageId,
        ...invoice,
      });
      await prisma.walletTopup.update({
        where: { id: topup.id },
        data: { telegramInvoiceMessageId: sent.message_id },
      });
      return;
    }

    if (!topup.qrisInvoiceAttempt) {
      throw new Error("Snapshot QRIS top up tidak ditemukan.");
    }
    const invoice = walletTopupQrisInvoice({
      locale,
      invoiceNumber: topup.invoiceNumber,
      baseAmount: topup.baseAmount,
      uniqueCode: topup.uniqueCode,
      billedAmount: topup.billedAmount,
      expiresAt: topup.expiresAt,
      providerKey: topup.qrisInvoiceAttempt.providerKeySnapshot,
      evidenceMode: topup.qrisInvoiceAttempt.evidenceMode,
      status: topup.status,
    });
    const providerLabel = walletTopupProviderLabel(
      locale,
      TELEGRAM_DANA_TOPUP_METHOD,
      topup.qrisInvoiceAttempt.providerKeySnapshot,
    );

    await deps.renderNavigationMessage({
      chatId: input.chatId,
      messageId: input.messageId,
      text: [
        locale === "en" ? "✅ Top-up invoice created." : "✅ Invoice top up dibuat.",
        "",
        `🧾 ${topup.invoiceNumber}`,
        `💳 ${locale === "en" ? "Total" : "Total"}: ${formatRupiah(topup.billedAmount)}`,
        locale === "en"
          ? `${providerLabel} is sent as a new transaction message.`
          : `${providerLabel} dikirim sebagai pesan transaksi baru.`,
      ].join("\n"),
      replyMarkup: {
        inline_keyboard: [[{
          text: locale === "en" ? "⬅️ Back to wallet" : "⬅️ Kembali ke wallet",
          callback_data: "wallet",
        }]],
      },
    });

    const rendered = await renderQrisInvoice({
      amount: topup.billedAmount,
      attempt: topup.qrisInvoiceAttempt,
    });
    const sentMessage = await sendPhotoBuffer({
      chatId: input.chatId,
      filename: `${topup.invoiceNumber}-QRIS.png`,
      png: rendered.png,
      caption: invoice.text,
      replyMarkup: invoice.replyMarkup,
    });
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: { telegramInvoiceMessageId: sentMessage.message_id },
    });
  }

  async function showQrisInvoice(input: {
    chatId: string;
    invoiceNumber: string;
    messageId?: number;
    notice?: string;
  }) {
    const topup = await prisma.walletTopup.findFirst({
      where: { invoiceNumber: input.invoiceNumber, chatId: input.chatId },
      include: { qrisInvoiceAttempt: true },
    });
    if (!topup?.qrisInvoiceAttempt || topup.paymentMethod !== TELEGRAM_DANA_TOPUP_METHOD) {
      throw new Error("Invoice top up QRIS tidak ditemukan.");
    }
    const locale = await telegramLocaleForChat(input.chatId);
    const rendered = await renderQrisInvoice({
      amount: topup.billedAmount,
      attempt: topup.qrisInvoiceAttempt,
    });
    const invoice = walletTopupQrisInvoice({
      locale,
      invoiceNumber: topup.invoiceNumber,
      baseAmount: topup.baseAmount,
      uniqueCode: topup.uniqueCode,
      billedAmount: topup.billedAmount,
      expiresAt: topup.expiresAt,
      providerKey: topup.qrisInvoiceAttempt.providerKeySnapshot,
      evidenceMode: topup.qrisInvoiceAttempt.evidenceMode,
      status: topup.status,
      notice: input.notice,
    });
    const sent = await deps.renderNavigationMessage({
      chatId: input.chatId,
      messageId: input.messageId,
      text: invoice.text,
      replyMarkup: invoice.replyMarkup,
      photoBuffer: {
        filename: `${topup.invoiceNumber}-QRIS.png`,
        png: rendered.png,
        reuseExistingPhoto: true,
      },
    });
    await prisma.walletTopup.update({
      where: { id: topup.id },
      data: { telegramInvoiceMessageId: sent.message_id },
    });
  }

  return { showOptions, showAmounts, showQrisInvoice, start };
}
