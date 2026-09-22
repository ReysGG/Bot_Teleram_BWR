import { parseProductPostDeliverySnapshot, PRODUCT_POST_DELIVERY_KIND } from "@/server/products/post-delivery";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { appRoute, optionalEnv } from "@/server/env";
import { createDigitalOrder } from "@/server/checkout/create-order";
import { callbackErrorContent } from "@/server/telegram/callback-error";
import {
  assertOrderQuantityWithinCapacity,
  getMaxOrderQuantity,
  normalizeOrderQuantity,
  resolveOrderQuantityCapacity,
} from "@/server/checkout/order-quantity";
import {
  calculateOrderSubtotal,
  maxOrderQuantityForUnitPrice,
} from "@/server/checkout/order-amount";
import { cleanError, formatRupiah } from "@/server/utils/format";
import {
  answerCallbackQuery,
  deleteMessage,
  sendMessage,
  sendPhotoBuffer,
} from "@/server/telegram/api";
import { consumeRateLimit } from "@/server/security/rate-limit";
import { isTelegramAdmin } from "@/server/security/admin-auth";
import { orderStatusLabel, resolveCheckoutAvailability } from "@/server/preorder/policy";
import {
  qrisCheckoutReady,
  renderQrisInvoice,
} from "@/server/payment/qris-invoice";
import { normalizeBuyerIdentity } from "@/server/orders/buyer";
import { ensureWallet } from "@/server/wallet/ledger";
import { getMaintenanceState } from "@/server/store/maintenance";
import { activePublicProductWhere } from "@/server/products/visibility";
import { telegramProductImageUrl } from "@/server/products/media";
import {
  acknowledgeOrderDelivery,
  deliveryFeedbackState,
  reportMissingOrderDelivery,
} from "@/server/telegram/delivery-feedback";
import { cancelPendingOrder } from "@/server/payment/cancel-order";
import { getUsdtBep20CheckoutConfig } from "@/server/payment/usdt-bep20";
import { getBinanceInternalCheckoutConfig } from "@/server/payment/binance-internal";
import { getJagoTransferCheckoutConfig } from "@/server/payment/jago-transfer";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import {
  refreshShopeePaymentForOrder,
  refreshShopeePaymentForWalletTopup,
} from "@/server/payment/shopee-partner-refresh";
import { isSellableStock } from "@/server/stock/sellable";
import { resolveSmsPoolTelegramError } from "@/server/smspool/telegram-error";
import { createSmsTelegramFlow } from "@/server/telegram/flows/sms";
import {
  createCatalogProductFlow,
  isCatalogCallback,
  isProductCallback,
  sellableHealthFilter,
} from "@/server/telegram/flows/catalog";
import {
  applyReferralOnFirstJoin,
  claimReferralReward,
  createOrUpdateReferralCode,
  getReferralProgramState,
  referralLink,
} from "@/server/referral/service";
import {
  communityMenuContent,
  helpMenuContent,
  mainMenuContent,
  moreMenuContent,
} from "@/server/telegram/menu";
import { loadTelegramAccountSummary } from "@/server/telegram/account-summary";
import {
  normalizeTelegramLocale,
  parseTelegramLanguageCallback,
  telegramLanguageCallback,
  telegramText,
} from "@/server/telegram/i18n";
import {
  setTelegramLocale,
  telegramLocaleForChat,
} from "@/server/telegram/locale-store";
import { createRedeemFlow } from "@/server/telegram/flows/redeem";
import { createUsdtBep20TelegramFlow } from "@/server/telegram/flows/payment/usdt-bep20";
import { createBinanceInternalTelegramFlow } from "@/server/telegram/flows/payment/binance-internal";
import { createJagoTransferTelegramFlow } from "@/server/telegram/flows/payment/jago-transfer";
import {
  createWalletTopupTelegramFlow,
  getWalletTopupProviderAvailability,
} from "@/server/telegram/flows/payment/wallet-topup";
import {
  parseWalletTopupAmountCallback,
  parseWalletTopupProviderCallback,
} from "@/server/telegram/flows/payment/wallet-topup-presentation";
import {
  usdtBep20ButtonText,
  usdtBep20LocksCancellation,
  usdtBep20PaymentOptionLabel,
  usdtBep20StatusText,
} from "@/server/telegram/flows/payment/usdt-bep20-presentation";
import {
  binanceInternalButtonText,
  binanceInternalLocksCancellation,
  binanceInternalPaymentOptionLabel,
  binanceInternalStatusText,
} from "@/server/telegram/flows/payment/binance-internal-presentation";
import {
  jagoTransferPaymentOptionLabel,
  jagoTransferStatusText,
} from "@/server/telegram/flows/payment/jago-transfer-presentation";
import {
  SMS_COUNTRY_PAGE_SIZE,
  SMS_HISTORY_PAGE_SIZE,
  SMS_SERVICE_PAGE_SIZE,
  SMSPOOL_INDONESIA_COUNTRY_ID,
  TELEGRAM_ADMIN_ID,
} from "@/server/telegram/constants";
import {
  beginNewNavigationBubble,
  callbackNavigationMessageId,
  isMessageNotModifiedError,
  navigationMessageTarget,
  renderNavigationMessage,
} from "@/server/telegram/navigation";
import {
  clearPendingQuantity,
  parsePendingMessage,
  parsePendingSmsSearch,
  parseQuantityCallback,
  rememberTelegramUser,
} from "@/server/telegram/session-state";
import { resolveTelegramPaymentOptions } from "@/server/telegram/payment-option-availability";
import {
  handleSetEmojiCommand,
  shouldHandleSetEmojiCommand,
} from "@/server/telegram/custom-emoji-command";
import type {
  PendingReferralCode,
  TelegramCallbackQuery,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from "@/server/telegram/types";

export type { TelegramUpdate } from "@/server/telegram/types";
export {
  callbackNavigationMessageId,
  isMessageNotModifiedError,
  navigationMessageTarget,
} from "@/server/telegram/navigation";

const smsFlow = createSmsTelegramFlow({
  renderNavigationMessage,
  beginNewNavigationBubble: async (chatId) => beginNewNavigationBubble(chatId),
});

const usdtBep20Flow = createUsdtBep20TelegramFlow({
  renderNavigationMessage,
});

const binanceInternalFlow = createBinanceInternalTelegramFlow({
  renderNavigationMessage,
});

const jagoTransferFlow = createJagoTransferTelegramFlow({
  renderNavigationMessage,
});

const walletTopupFlow = createWalletTopupTelegramFlow({
  renderNavigationMessage,
});

const catalogFlow = createCatalogProductFlow({
  renderNavigationMessage,
  beginNewNavigationBubble: async (chatId) => beginNewNavigationBubble(chatId),
  showMenu: async (chatId) => showMenu(chatId),
  showPaymentOptions,
});

async function setBroadcast(
  chatId: string,
  enabled: boolean,
  messageId?: number,
) {
  await prisma.botSession.upsert({
    where: { chatId },
    create: { chatId, broadcastEnabled: enabled },
    update: { broadcastEnabled: enabled },
  });
  await showNotificationSettings(chatId, messageId);
}

async function showNotificationSettings(chatId: string, messageId?: number) {
  const session = await prisma.botSession.findUnique({ where: { chatId } });
  const enabled = session?.broadcastEnabled ?? true;
  await renderNavigationMessage({
    chatId,
    messageId,
    text: enabled
      ? "🔔 Notifikasi produk baru sedang aktif."
      : "🔕 Notifikasi produk baru sedang nonaktif.",
    replyMarkup: {
      inline_keyboard: [
        [
          enabled
            ? { text: "🔕 Matikan notifikasi", callback_data: "unsubscribe" }
            : { text: "🔔 Aktifkan notifikasi", callback_data: "subscribe" },
        ],
        [{ text: "⬅️ Kembali", callback_data: "menu" }],
      ],
    },
  });
}

async function showMenu(chatId: string, messageId?: number, notice?: string) {
  const [locale, account] = await Promise.all([
    telegramLocaleForChat(chatId),
    loadTelegramAccountSummary(chatId),
  ]);
  const menu = mainMenuContent(notice, locale, account);
  await renderNavigationMessage({
    chatId,
    messageId,
    text: menu.text,
    replyMarkup: menu.replyMarkup,
    photoUrl: appRoute("/bwr-tele-menu.png").toString(),
  });
}

async function showCommunity(chatId: string, messageId?: number) {
  const locale = await telegramLocaleForChat(chatId);
  const menu = communityMenuContent(locale);
  await renderNavigationMessage({
    chatId,
    messageId,
    text: menu.text,
    replyMarkup: menu.replyMarkup,
  });
}

async function showMoreMenu(chatId: string, messageId?: number) {
  const locale = await telegramLocaleForChat(chatId);
  const menu = moreMenuContent(locale);
  await renderNavigationMessage({
    chatId,
    messageId,
    text: menu.text,
    replyMarkup: menu.replyMarkup,
  });
}

async function showHelp(chatId: string, messageId?: number) {
  const locale = await telegramLocaleForChat(chatId);
  const menu = helpMenuContent(locale);
  await renderNavigationMessage({
    chatId,
    messageId,
    text: menu.text,
    replyMarkup: menu.replyMarkup,
  });
}

async function showLanguagePrompt(chatId: string, messageId?: number) {
  const locale = await telegramLocaleForChat(chatId);
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      telegramText(locale, "languageTitle"),
      "",
      telegramText(locale, "languageDescription"),
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{
          text: `${locale === "id" ? "✅ " : ""}${telegramText(locale, "languageIndonesian")}`,
          callback_data: telegramLanguageCallback("id"),
        }],
        [{
          text: `${locale === "en" ? "✅ " : ""}${telegramText(locale, "languageEnglish")}`,
          callback_data: telegramLanguageCallback("en"),
        }],
        [{ text: telegramText(locale, "backToMenu"), callback_data: "menu" }],
      ],
    },
  });
}

const redeemFlow = createRedeemFlow({ renderNavigationMessage, showMenu });


async function showWallet(
  chatId: string,
  user?: TelegramUser,
  messageId?: number,
) {
  const identity = normalizeBuyerIdentity({
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
  });
  await ensureWallet(chatId, identity);
  const [wallet, topupAvailability] = await Promise.all([
    prisma.wallet.findUniqueOrThrow({
      where: { chatId },
      include: {
        transactions: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    }),
    getWalletTopupProviderAvailability(),
  ]);
  const history = wallet.transactions.length
    ? wallet.transactions.map((transaction) => {
        const sign = transaction.amount > 0 ? "+" : "-";
        return `${sign} ${formatRupiah(Math.abs(transaction.amount))} · ${transaction.type}`;
      })
    : ["Belum ada mutasi saldo."];
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      "💰 Wallet BWR Tele",
      "",
      `Saldo tersedia: ${formatRupiah(wallet.balance)}`,
      "",
      "Mutasi terbaru:",
      ...history,
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(topupAvailability.providers.length > 0
          ? [[{ text: "➕ Top up saldo", callback_data: "topup" }]]
          : []),
        [{ text: "🛍️ Belanja", callback_data: "catalog" }],
        [{ text: "⬅️ Kembali", callback_data: "menu" }],
      ],
    },
  });
}

async function showReferral(
  chatId: string,
  user?: TelegramUser,
  messageId?: number,
  notice?: string,
) {
  const identity = normalizeBuyerIdentity({
    username: user?.username,
    firstName: user?.first_name,
    lastName: user?.last_name,
  });
  const [setting, code] = await Promise.all([
    getReferralProgramState(),
    prisma.referralCode.findUnique({
      where: { ownerChatId: chatId },
      include: { _count: { select: { attributions: true, claims: true } } },
    }),
  ]);
  if (code && (
    code.ownerUsername !== identity.buyerUsername ||
    code.ownerDisplayName !== identity.buyerDisplayName
  )) {
    await prisma.referralCode.update({
      where: { id: code.id },
      data: {
        ownerUsername: identity.buyerUsername,
        ownerDisplayName: identity.buyerDisplayName,
      },
    });
  }
  const claimsAvailable = code && setting.claimThresholdPoints > 0
    ? Math.floor(code.pointBalance / setting.claimThresholdPoints)
    : 0;
  await renderNavigationMessage({
    chatId,
    messageId,
    text: code
      ? [
          "🤝 REFERRAL BWR TELE",
          ...(notice ? ["", notice] : []),
          "",
          `Kode kamu: ${code.code}`,
          `Link: ${referralLink(code.code)}`,
          "",
          `Saldo poin: ${code.pointBalance}`,
          `Total join: ${code._count.attributions}`,
          `Total reward: ${formatRupiah(code.totalRewardClaimed)}`,
          "",
          setting.enabled
            ? `+${setting.pointsPerJoin} poin per user baru. Claim ${setting.claimThresholdPoints} poin = ${formatRupiah(setting.claimRewardAmount)}.`
            : "Program referral sedang dijeda admin. Poin lama tetap tersimpan dan masih dapat diclaim jika reward sudah dikonfigurasi.",
        ].join("\n")
      : [
          "🤝 REFERRAL BWR TELE",
          ...(notice ? ["", notice] : []),
          "",
          "Buat kode unik milikmu, bagikan link referral, dan kumpulkan poin saat user baru bergabung.",
          "",
          setting.enabled
            ? `Saat ini: +${setting.pointsPerJoin} poin per join. Claim ${setting.claimThresholdPoints} poin = ${formatRupiah(setting.claimRewardAmount)}.`
            : "Program referral sedang dijeda admin.",
        ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{
          text: code ? "✏️ Ubah kode" : "✨ Buat kode referral",
          callback_data: "referral_create",
        }],
        ...(code
          ? [[{
              text: claimsAvailable > 0
                ? `🎁 Claim reward (${claimsAvailable} tersedia)`
                : `🔒 Claim · butuh ${setting.claimThresholdPoints} poin`,
              callback_data: "referral_claim",
            }]]
          : []),
        [{ text: "💰 Wallet", callback_data: "wallet" }],
        [{ text: "⬅️ Menu utama", callback_data: "menu" }],
      ],
    },
  });
}

async function showReferralCodePrompt(chatId: string, messageId?: number) {
  const rendered = await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      "✨ Buat kode referral",
      "",
      "Kirim kode 3-20 karakter.",
      "Boleh memakai huruf, angka, dan underscore.",
      "",
      "Contoh: DAVID88 atau BWR_DAVID",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "referral" }]],
    },
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "AWAITING_REFERRAL_CODE",
      cart: { messageId: rendered.message_id },
    },
    update: {
      state: "AWAITING_REFERRAL_CODE",
      cart: { messageId: rendered.message_id },
    },
  });
}

async function showPaymentOptions(
  chatId: string,
  productId: string,
  user: TelegramUser,
  quantity: number,
  messageId?: number,
) {
  const normalizedQuantity = normalizeOrderQuantity(quantity);
  const identity = normalizeBuyerIdentity({
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  });
  const [product, wallet, maintenance, paymentMethods, qrisReady, usdtConfig, binanceConfig, jagoConfig, locale] = await Promise.all([
    prisma.product.findFirst({
      where: activePublicProductWhere(productId),
      select: {
        id: true,
        name: true,
        variantLabel: true,
        group: { select: { id: true, name: true, imageUrl: true } },
        imageUrl: true,
        price: true,
        preorderEnabled: true,
        preorderLimit: true,
        stockItems: {
          where: {
            archivedAt: null,
            status: { in: ["AVAILABLE", "RESERVED"] },
            ...sellableHealthFilter(),
          },
          select: { status: true },
        },
        _count: {
          select: {
            orderItems: {
              where: {
                stockItemId: null,
                order: {
                  isPreorder: true,
                  status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] },
                },
              },
            },
          },
        },
      },
    }),
    ensureWallet(chatId, identity),
    getMaintenanceState(),
    getPaymentMethodAvailability(),
    qrisCheckoutReady(),
    getUsdtBep20CheckoutConfig(),
    getBinanceInternalCheckoutConfig(),
    getJagoTransferCheckoutConfig(),
    telegramLocaleForChat(chatId, user.language_code),
  ]);
  if (!product) throw new Error("Produk tidak tersedia");
  const availableUnits = product.stockItems.filter(
    (item) => item.status === "AVAILABLE",
  ).length;
  const reservedUnits = product.stockItems.filter(
    (item) => item.status === "RESERVED",
  ).length;
  assertOrderQuantityWithinCapacity(
    normalizedQuantity,
    resolveOrderQuantityCapacity({
      readyStock: availableUnits,
      reservedStock: reservedUnits,
      preorderEnabled: product.preorderEnabled,
      preorderLimit: product.preorderLimit,
      activePreorders: product._count.orderItems,
      configuredMaximum: Math.min(
        getMaxOrderQuantity(),
        maxOrderQuantityForUnitPrice(product.price),
      ),
    }),
  );
  const availability = resolveCheckoutAvailability({
    stockAvailable: availableUnits >= normalizedQuantity,
    reservedUnits,
    preorderEnabled: product.preorderEnabled,
    preorderLimit: product.preorderLimit,
    activePreorders: product._count.orderItems,
    requestedUnits: normalizedQuantity,
  });
  const stockLine =
    locale === "en"
      ? availability === "IN_STOCK"
        ? `✅ Stock available: ${availableUnits} accounts`
        : availability === "WAITING_CHECKOUT"
          ? `⏳ ${reservedUnits} units are reserved by active checkouts`
          : availability === "PREORDER"
            ? `❌ Insufficient stock: ${availableUnits} available for ${normalizedQuantity} accounts (preorder)`
            : availability === "PREORDER_FULL"
              ? "❌ Insufficient stock and preorder slots are full"
              : `❌ Insufficient stock: ${availableUnits} available for ${normalizedQuantity} accounts`
      : availability === "IN_STOCK"
      ? `✅ Stok cukup: ${availableUnits} akun tersedia`
      : availability === "WAITING_CHECKOUT"
        ? `⏳ ${reservedUnits} stok sedang dikunci checkout aktif`
        : availability === "PREORDER"
          ? `❌ Stok tidak cukup: ${availableUnits} tersedia untuk ${normalizedQuantity} akun (preorder)`
          : availability === "PREORDER_FULL"
            ? `❌ Stok tidak cukup dan slot preorder penuh`
            : `❌ Stok tidak cukup: ${availableUnits} tersedia untuk ${normalizedQuantity} akun`;
  const checkoutAllowed =
    !maintenance.enabled &&
    (availability === "IN_STOCK" || availability === "PREORDER");
  const subtotal = calculateOrderSubtotal(product.price, normalizedQuantity);
  const canCombineBalance = wallet.balance > 0 && wallet.balance < subtotal;
  const qrisRemainder = Math.max(0, subtotal - wallet.balance);
  const paymentOptions = resolveTelegramPaymentOptions({
    locale,
    checkoutAllowed,
    walletBalance: wallet.balance,
    subtotal,
    paymentMethods,
    qrisReady,
    usdtBep20Ready: usdtConfig.enabled && Boolean(usdtConfig.recipientAddress),
    binanceInternalReady: binanceConfig.enabled && Boolean(binanceConfig.recipientId),
    jagoTransferReady: jagoConfig.enabled && Boolean(jagoConfig.accountNumber),
  });
  const photoUrl = telegramProductImageUrl({
    productId: product.id,
    productImageUrl: product.imageUrl,
    group: product.group,
  });
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      `🧩 ${product.group ? `${product.group.name} › ${product.variantLabel?.trim() || product.name}` : product.name}`,
      locale === "en" ? `📦 Quantity: ${normalizedQuantity} accounts` : `📦 Jumlah: ${normalizedQuantity} akun`,
      locale === "en" ? `📊 Ready stock: ${availableUnits} accounts` : `📊 Total stok siap: ${availableUnits} akun`,
      stockLine,
      ...(maintenance.enabled ? [`🔧 ${maintenance.message}`] : []),
      `💵 ${locale === "en" ? "Unit price" : "Harga satuan"}: ${formatRupiah(product.price)}`,
      `🧾 Subtotal: ${formatRupiah(subtotal)}`,
      `💰 ${locale === "en" ? "Your balance" : "Saldo kamu"}: ${formatRupiah(wallet.balance)}`,
      "",
      paymentOptions.prompt,
    ].join("\n"),
    photoUrl,
    replyMarkup: {
      inline_keyboard: [
        ...(paymentOptions.wallet
          ? [[{ text: locale === "en" ? "Pay with wallet" : "Bayar pakai saldo", callback_data: `pay_wallet:${product.id}:${normalizedQuantity}`, style: "success" as const }]]
          : []),
        ...(paymentOptions.mixed
          ? [[{
              text: locale === "en" ? `Wallet + QRIS · remaining ${formatRupiah(qrisRemainder)}` : `Saldo + QRIS · sisa ${formatRupiah(qrisRemainder)}`,
              callback_data: `pay_mixed:${product.id}:${normalizedQuantity}`,
              style: "primary" as const,
            }]]
          : []),
        ...(paymentOptions.topup
          ? [[{ text: locale === "en" ? "Saldo kurang · top up" : "Saldo belum cukup · top up", callback_data: "topup", style: "primary" as const }]]
          : []),
        ...(paymentOptions.qris
          ? [[{
              text: locale === "en"
                ? canCombineBalance ? "Pay in full with QRIS" : "Pay with QRIS/DANA"
                : canCombineBalance ? "Bayar QRIS penuh" : "Bayar QRIS/DANA",
              callback_data: `pay_qris:${product.id}:${normalizedQuantity}`,
              style: "primary" as const,
            }]]
          : []),
        ...(paymentOptions.usdtBep20
          ? [[{
              text: usdtBep20PaymentOptionLabel(locale),
              callback_data: `pay_usdt:${product.id}:${normalizedQuantity}`,
              style: "primary" as const,
            }]]
          : []),
        ...(paymentOptions.binanceInternal
          ? [[{
              text: binanceInternalPaymentOptionLabel(locale),
              callback_data: `pay_binance:${product.id}:${normalizedQuantity}`,
              style: "primary" as const,
            }]]
          : []),
        ...(paymentOptions.jagoTransfer
          ? [[{
              text: jagoTransferPaymentOptionLabel(locale),
              callback_data: `pay_jago:${product.id}:${normalizedQuantity}`,
              style: "primary" as const,
            }]]
          : []),
        [{ text: locale === "en" ? "Kembali" : "Kembali", callback_data: `buy:${product.id}` }],
      ],
    },
  });
}

async function startCheckout(
  chatId: string,
  productId: string,
  user: TelegramUser,
  idempotencyKey: string,
  paymentMethod: "DANA" | "WALLET" | "WALLET_QRIS",
  quantity: number,
  messageId?: number,
) {
  const normalizedQuantity = normalizeOrderQuantity(quantity);
  const identity = normalizeBuyerIdentity({
    username: user.username,
    firstName: user.first_name,
    lastName: user.last_name,
  });
  await prisma.botSession.upsert({
    where: { chatId },
    create: {
      chatId,
      state: "BROWSING",
      ...identity,
      checkoutKey: idempotencyKey,
    },
    update: {
      state: "BROWSING",
      cart: Prisma.JsonNull,
      ...identity,
      checkoutKey: idempotencyKey,
    },
  });

  const order = await createDigitalOrder({
    chatId,
    productId,
    idempotencyKey,
    paymentMethod,
    quantity: normalizedQuantity,
    ...identity,
  });
  await prisma.botSession.update({
    where: { chatId },
    data: {
      state: "BROWSING",
      activeOrderId: order.id,
      cart: Prisma.JsonNull,
      checkoutKey: null,
    },
  });
  if (order.payment?.method !== "WALLET") {
    await sendInvoice(chatId, order);
    return;
  }
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { chatId } });
  const walletPaymentText = order.isPreorder
    ? [
        "Pembayaran diterima",
        "",
        `Invoice: ${order.invoiceNumber}`,
        `Jumlah: ${order.items.length} akun`,
        `Total: ${formatRupiah(order.grandTotal)}`,
        `Sisa wallet: ${formatRupiah(wallet.balance)}`,
        "",
        "Order masuk antrean preorder dan belum direfund selama masih menunggu stok.",
        `Estimasi: ${order.preorderEtaText ?? "akan diinformasikan admin"}`,
      ]
    : [
        "Pembayaran diterima",
        "",
        `Invoice: ${order.invoiceNumber}`,
        `Total: ${formatRupiah(order.grandTotal)}`,
        "Status: File sedang disiapkan dan akan dikirim di chat ini.",
      ];
  await renderNavigationMessage({
    chatId,
    messageId,
    text: walletPaymentText.join("\n"),
    replyMarkup: {
      inline_keyboard: order.isPreorder
        ? [
            [{ text: "Detail order", callback_data: `order:${order.id}` }],
            [
              { text: "Lihat wallet", callback_data: "wallet" },
              { text: "Kembali ke katalog", callback_data: "catalog" },
            ],
          ]
        : [[{
            text: "Detail order",
            callback_data: `order:${order.id}`,
            style: "primary",
          }]],
    },
  });
}

async function sendInvoice(chatId: string, order: Awaited<ReturnType<typeof createDigitalOrder>>) {
  if (!order.payment) throw new Error("Payment record was not created");
  const instructions =
    optionalEnv("PAYMENT_INSTRUCTIONS") ??
    "Bayar nominal tepat lalu tunggu konfirmasi otomatis.";
  const message = [
    `🧾 Invoice: ${order.invoiceNumber}`,
    ...(order.isPreorder
      ? [
          "⏳ Jenis: PREORDER BERBAYAR",
          `🗓️ Estimasi: ${order.preorderEtaText ?? "akan diinformasikan admin"}`,
        ]
      : []),
    `💳 Total: ${formatRupiah(order.payment.billedAmount)}`,
    ...(order.payment.method === "WALLET_QRIS"
      ? [
          `💰 Dipotong dari saldo: ${formatRupiah(order.grandTotal - order.payment.billedAmount)}`,
          `🔢 Termasuk kode unik: ${formatRupiah(order.payment.uniqueCode ?? 0)}`,
        ]
      : []),
    `📦 Jumlah file: ${order.items.length}`,
    `⏰ Batas bayar: ${order.expiresAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    "",
    instructions,
    "⚠️ Nominal harus sama persis agar pembayaran dapat dicocokkan.",
    ...(order.isPreorder
      ? ["📥 Setelah lunas, order masuk antrean FIFO dan file dikirim otomatis saat stok sehat tersedia."]
      : []),
  ].join("\n");
  const rendered = await renderQrisInvoice({
    amount: order.payment.billedAmount,
    attempt: order.qrisInvoiceAttempt,
  });
  const sentMessage = await sendPhotoBuffer({
    chatId,
    filename: `${order.invoiceNumber}-QRIS.png`,
    png: rendered.png,
    caption: message,
    replyMarkup: { inline_keyboard: [
      ...(order.paymentStatus !== "PAID" &&
        order.qrisInvoiceAttempt?.providerKeySnapshot === "SHOPEE_PARTNER"
        ? [[{
            text: "🔄 Refresh pembayaran",
            callback_data: `shopee_refresh:${order.id}`,
          }]]
        : []),
      [{ text: "Lihat order", callback_data: "order:" + order.id }],
      [{ text: "Batalkan pembayaran", callback_data: "cancel_order:" + order.id }],
      [{ text: "Kembali ke katalog", callback_data: "catalog" }],
    ] },
  });
  await prisma.payment.update({
    where: { id: order.payment.id },
    data: { telegramInvoiceMessageId: sentMessage.message_id },
  });
}

async function showOrders(chatId: string, messageId?: number) {
  const locale = await telegramLocaleForChat(chatId);
  const [pendingOrders, recentOrders] = await Promise.all([
    prisma.order.findMany({
      where: { chatId, status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.order.findMany({ where: { chatId }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  const pendingIds = new Set(pendingOrders.map(order => order.id));
  const orders = [...pendingOrders, ...recentOrders.filter(order => !pendingIds.has(order.id))];
  if (orders.length === 0) {
    await renderNavigationMessage({
      chatId,
      messageId,
      text: locale === "en" ? "📦 You do not have any orders yet." : "📦 Belum ada order yang tercatat.",
      replyMarkup: {
        inline_keyboard: [
          [{ text: locale === "en" ? "🛍️ View catalog" : "🛍️ Lihat katalog", callback_data: "catalog" }],
          [{ text: locale === "en" ? "⬅️ Back" : "⬅️ Kembali", callback_data: "menu" }],
        ],
      },
    });
    return;
  }
  await renderNavigationMessage({
    chatId,
    messageId,
    text: locale === "en" ? "📦 Choose an order to view its details and latest status:" : "📦 Pilih order untuk melihat detail dan status terbaru:",
    replyMarkup: {
      inline_keyboard: [
        ...orders.map((order) => [
          {
            text: `🧾 ${order.invoiceNumber} · ${orderStatusLabel(order.status, locale)}`,
            callback_data: `order:${order.id}`,
          },
        ]),
        [{ text: locale === "en" ? "⬅️ Back" : "⬅️ Kembali", callback_data: "menu" }],
      ],
    },
  });
}

async function showOrder(
  chatId: string,
  orderId: string,
  messageId?: number,
  notice?: string,
) {
  const [order, locale] = await Promise.all([
    prisma.order.findFirst({
      where: { id: orderId, chatId },
      include: {
        payment: true,
        qrisInvoiceAttempt: {
          select: {
            evidenceMode: true,
            providerKeySnapshot: true,
          },
        },
        usdtBep20Attempt: true,
        binanceInternalPaymentAttempt: true,
        jagoTransferAttempt: true,
        items: {
          include: { stockItem: { select: { originalFilename: true } } },
        },
        deliveryReceipts: {
          where: { status: "SENT" },
          orderBy: { sentAt: "desc" },
        },
        notifications: {
          where: {
            kind: {
              in: ["DELIVERY_ACKNOWLEDGED", "DELIVERY_MISSING_REPORT"],
            },
          },
          select: { kind: true, status: true },
        },
      },
    }),
    telegramLocaleForChat(chatId),
  ]);
  if (!order || !order.payment) throw new Error("Order tidak ditemukan");
  const usdtStatusLines = order.usdtBep20Attempt
    ? [
        "",
        "💵 USDT BEP20",
        usdtBep20StatusText({
          locale,
          status: order.usdtBep20Attempt.status,
          transactionHash: order.usdtBep20Attempt.txHash,
          confirmations: order.usdtBep20Attempt.confirmations,
          requiredConfirmations:
            order.usdtBep20Attempt.requiredConfirmationsSnapshot,
        }),
      ]
    : [];
  const binanceStatusLines = order.binanceInternalPaymentAttempt
    ? [
        "",
        "Binance Pay (Binance-to-Binance)",
        binanceInternalStatusText({
          locale,
          status: order.binanceInternalPaymentAttempt.status,
          submittedOrderId: order.binanceInternalPaymentAttempt.submittedOrderId,
        }),
      ]
    : [];
  const jagoStatusLines = order.jagoTransferAttempt
    ? [
        "",
        locale === "en" ? "🏦 Bank Jago transfer" : "🏦 Transfer Bank Jago",
        jagoTransferStatusText({ locale, status: order.jagoTransferAttempt.status }),
      ]
    : [];
  const feedback = deliveryFeedbackState(order.notifications);
  const filenameByStockItemId = new Map(
    order.items.flatMap((item) =>
      item.stockItemId && item.stockItem?.originalFilename
        ? [[item.stockItemId, item.stockItem.originalFilename] as const]
        : [],
    ),
  );
  const deliveryGroups = new Map<string, { sentAt: Date | null; filenames: string[] }>();
  for (const receipt of order.deliveryReceipts) {
    const key = receipt.telegramMessageId ?? receipt.id;
    const group = deliveryGroups.get(key) ?? { sentAt: receipt.sentAt, filenames: [] };
    const filename = filenameByStockItemId.get(receipt.stockItemId);
    if (filename) group.filenames.push(filename);
    deliveryGroups.set(key, group);
  }
  const deliveryLines = [...deliveryGroups.values()].map((delivery) => {
    const filename = delivery.filenames.length === 1
      ? delivery.filenames[0]
      : locale === "en" ? `Combined file for ${delivery.filenames.length || order.items.length} accounts` : `File gabungan ${delivery.filenames.length || order.items.length} akun`;
    const sentAt = delivery.sentAt?.toLocaleString(locale === "en" ? "en-GB" : "id-ID", {
      timeZone: "Asia/Jakarta",
    }) ?? (locale === "en" ? "time not recorded" : "waktu tidak tercatat");
    return `• ${filename} — ${locale === "en" ? "accepted by Telegram" : "diterima server Telegram"} ${sentAt}`;
  });
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      ...(notice ? [notice, ""] : []),
      locale === "en" ? "📦 Order details" : "📦 Detail order",
      "",
      `🧾 ${order.invoiceNumber}`,
      `🧩 ${order.items[0]?.productNameSnapshot ?? (locale === "en" ? "Digital product" : "Produk digital")}`,
      locale === "en" ? `📦 Quantity: ${order.items.length} accounts` : `📦 Jumlah: ${order.items.length} akun`,
      `💰 ${formatRupiah(order.grandTotal)}`,
      `📌 Status: ${orderStatusLabel(order.status, locale)}`,
      `💳 ${locale === "en" ? "Payment" : "Pembayaran"}: ${
        order.payment.method === "USDT_BEP20"
          ? "USDT BEP20 · "
          : order.payment.method === "BINANCE_INTERNAL"
            ? "Binance Pay internal · "
            : order.payment.method === "JAGO_TRANSFER"
              ? "Bank Jago · "
            : ""
      }${order.payment.status}`,
      ...usdtStatusLines,
      ...binanceStatusLines,
      ...jagoStatusLines,
      ...(order.isPreorder
        ? [`🗓️ ${locale === "en" ? "Estimate" : "Estimasi"}: ${order.preorderEtaText ?? (locale === "en" ? "the admin will provide an update" : "akan diinformasikan admin")}`]
        : []),
      `⏰ ${locale === "en" ? "Created" : "Dibuat"}: ${order.createdAt.toLocaleString(locale === "en" ? "en-GB" : "id-ID", { timeZone: "Asia/Jakarta" })}`,
      ...(deliveryLines.length > 0
        ? [
            "",
            locale === "en" ? "📨 Product delivery" : "📨 Pengiriman produk",
            ...deliveryLines,
            locale === "en" ? "Telegram accepted the file. If you cannot see it, check the messages before the menu or guide." : "Status ini berarti Telegram menerima file. Jika file tidak terlihat, cek beberapa pesan sebelum menu/panduan.",
            ...(feedback.acknowledged
              ? [locale === "en" ? "Your receipt confirmation has been recorded." : "Konfirmasi penerimaan sudah tercatat."]
              : feedback.missingReported
                ? [locale === "en" ? "Your missing-file report has been sent to the admin. The bot will not automatically resend the file." : "Laporan file tidak terlihat sudah diteruskan ke admin. Bot tidak mengirim ulang otomatis."]
                : []),
          ]
        : []),
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        ...(order.usdtBep20Attempt?.status === "AWAITING_TX_HASH"
          ? [[{
              text: usdtBep20ButtonText(locale, "transferred"),
              callback_data: `usdt_transferred:${order.id}`,
            }]]
          : []),
        ...(order.usdtBep20Attempt &&
        ["VERIFYING", "PENDING_CONFIRMATIONS", "VERIFIED"].includes(
          order.usdtBep20Attempt.status,
        )
          ? [[{
              text: usdtBep20ButtonText(locale, "refresh"),
              callback_data: `usdt_refresh:${order.id}`,
            }]]
          : []),
        ...(order.binanceInternalPaymentAttempt?.status === "AWAITING_ORDER_ID"
          ? [[{
              text: binanceInternalButtonText(locale, "transferred"),
              callback_data: `binance_transferred:${order.id}`,
            }]]
          : []),
        ...(order.binanceInternalPaymentAttempt &&
        ["VERIFYING", "VERIFIED"].includes(order.binanceInternalPaymentAttempt.status)
          ? [[{
              text: binanceInternalButtonText(locale, "refresh"),
              callback_data: `binance_refresh:${order.id}`,
            }]]
          : []),
      ...(order.jagoTransferAttempt?.status === "AWAITING_TRANSFER"
          ? [[{
              text: locale === "en" ? "🔄 Refresh Bank Jago" : "🔄 Refresh Bank Jago",
              callback_data: `jago_invoice:${order.id}`,
            }]]
          : []),
      ...(order.paymentStatus !== "PAID" &&
        order.qrisInvoiceAttempt?.providerKeySnapshot === "SHOPEE_PARTNER"
          ? [[{
              text: locale === "en" ? "Refresh Shopee payment" : "Refresh pembayaran Shopee",
              callback_data: `shopee_refresh:${order.id}`,
              style: "primary" as const,
            }]]
          : []),
        [{ text: "🔄 Refresh status", callback_data: `order:${order.id}` }],
        ...(order.status === "PENDING_PAYMENT" &&
        !usdtBep20LocksCancellation(order.usdtBep20Attempt?.status) &&
        !binanceInternalLocksCancellation(order.binanceInternalPaymentAttempt?.status)
          ? [[{ text: locale === "en" ? "❌ Cancel payment" : "❌ Batalkan pembayaran", callback_data: `cancel_order:${order.id}` }]]
          : []),
        ...(deliveryLines.length > 0
          ? [
              ...(feedback.acknowledged
                ? []
                : [[{ text: locale === "en" ? "File received" : "File diterima", callback_data: `delivery_ack:${order.id}` }]]),
              [{ text: locale === "en" ? "File not visible" : "File tidak terlihat", callback_data: `delivery_missing:${order.id}` }],
            ]
          : []),
        [{ text: locale === "en" ? "Main menu" : "Menu utama", callback_data: "menu" }],
        [{ text: locale === "en" ? "⬅️ Back" : "⬅️ Kembali", callback_data: "orders" }],
      ],
    },
  });
}

async function showDeliveryFeedbackResult(
  chatId: string,
  orderId: string,
  messageId: number | undefined,
  missing: boolean,
) {
  const locale = await telegramLocaleForChat(chatId);
  const english = locale === "en";
  await renderNavigationMessage({
    chatId,
    messageId,
    text: missing
      ? english
        ? "Your report was recorded. The admin will check the delivery; the bot will not resend the file automatically."
        : "Laporan file tidak terlihat sudah dicatat. Admin akan mengecek; bot tidak mengirim ulang file secara otomatis."
      : english
        ? "File received. No further action is needed."
        : "File sudah diterima. Tidak ada tindakan lain yang diperlukan.",
    replyMarkup: {
      inline_keyboard: [
        [{
          text: english ? "View order details" : "Lihat detail order",
          callback_data: `order:${orderId}`,
        }],
        [{
          text: english ? "Main menu" : "Menu utama",
          callback_data: "menu",
        }],
      ],
    },
  });
}

async function showCancelOrderConfirmation(
  chatId: string,
  orderId: string,
  messageId: number,
) {
  const locale = await telegramLocaleForChat(chatId);
  const order = await prisma.order.findFirst({
    where: { id: orderId, chatId },
    include: {
      payment: true,
      usdtBep20Attempt: true,
      binanceInternalPaymentAttempt: true,
    },
  });
  if (!order || !order.payment) throw new Error("Order tidak ditemukan");
  if (
    order.status !== "PENDING_PAYMENT" ||
    order.payment.status !== "PENDING" ||
    usdtBep20LocksCancellation(order.usdtBep20Attempt?.status) ||
    binanceInternalLocksCancellation(order.binanceInternalPaymentAttempt?.status)
  ) {
    throw new Error("Order ini sudah tidak dapat dibatalkan");
  }
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      locale === "en" ? "⚠️ Cancel payment?" : "⚠️ Batalkan pembayaran?",
      "",
      `🧾 ${order.invoiceNumber}`,
      `💰 ${formatRupiah(order.grandTotal)}`,
      locale === "en" ? "The invoice will be closed and can no longer be paid." : "Invoice akan ditutup dan tidak dapat dibayar lagi.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{ text: locale === "en" ? "✅ Yes, cancel invoice" : "✅ Ya, batalkan invoice", callback_data: `cancel_order_confirm:${order.id}` }],
        [{ text: locale === "en" ? "⬅️ Keep invoice" : "⬅️ Jangan batalkan", callback_data: `order:${order.id}` }],
      ],
    },
  });
}

async function cancelOrderFromTelegram(
  chatId: string,
  orderId: string,
  messageId: number,
) {
  const locale = await telegramLocaleForChat(chatId);
  const order = await cancelPendingOrder({ orderId, chatId });
  const invoiceMessageId = order.payment?.telegramInvoiceMessageId;
  if (invoiceMessageId && invoiceMessageId !== messageId) {
    await deleteMessage(chatId, invoiceMessageId).catch(() => undefined);
  }
  await renderNavigationMessage({
    chatId,
    messageId,
    text: [
      locale === "en" ? "✅ Invoice cancelled." : "✅ Invoice berhasil dibatalkan.",
      "",
      `🧾 ${order.invoiceNumber}`,
      locale === "en" ? "Stock is no longer reserved and you can create a new order." : "Stok tidak dikunci dan kamu bisa membuat order baru.",
    ].join("\n"),
    replyMarkup: {
      inline_keyboard: [
        [{ text: locale === "en" ? "🛍️ Continue shopping" : "🛍️ Kembali belanja", callback_data: "catalog" }],
        [{ text: locale === "en" ? "📦 My orders" : "📦 Order saya", callback_data: "orders" }],
      ],
    },
  });
}

async function showAdminStock(chatId: string) {
  if (!isTelegramAdmin(chatId)) {
    await sendMessage(chatId, "🔐 Perintah ini hanya tersedia untuk admin.");
    return;
  }
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockItems: {
        select: {
          status: true,
          healthStatus: true,
          healthHttpStatus: true,
          bannedSaleApprovedAt: true,
          archivedAt: true,
        },
      },
    },
  });
  const lines = products.map((product) => {
    const activeItems = product.stockItems.filter((item) => !item.archivedAt);
    const ready = activeItems.filter(
      (item) => item.status === "AVAILABLE" && isSellableStock({
        healthStatus: item.healthStatus,
        healthHttpStatus: item.healthHttpStatus,
        bannedSaleApprovedAt: item.bannedSaleApprovedAt,
        bannedStockPolicy: product.bannedStockPolicy,
      }),
    ).length;
    const banned = activeItems.filter(
      (item) => item.healthStatus === "BANNED" && !isSellableStock({
        healthStatus: item.healthStatus,
        healthHttpStatus: item.healthHttpStatus,
        bannedSaleApprovedAt: item.bannedSaleApprovedAt,
        bannedStockPolicy: product.bannedStockPolicy,
      }),
    ).length;
    const pending = activeItems.filter(
      (item) => item.status === "AVAILABLE" &&
        item.healthStatus !== "BANNED" &&
        !isSellableStock({
        healthStatus: item.healthStatus,
        healthHttpStatus: item.healthHttpStatus,
        bannedSaleApprovedAt: item.bannedSaleApprovedAt,
        bannedStockPolicy: product.bannedStockPolicy,
        }),
    ).length;
    return `🧩 ${product.name}: ✅ ${ready} siap jual · ⏳ ${pending} belum siap · 🚫 ${banned} diblokir`;
  });
  await sendMessage(chatId, lines.length ? lines.join("\n") : "🛍️ Belum ada produk.");
}

async function handleMessage(message: TelegramMessage) {
  const chatId = String(message.chat.id);
  const text = message.text?.trim();
  const existingSession = await prisma.botSession.findUnique({
    where: { chatId },
    select: { chatId: true },
  });
  const identity = await rememberTelegramUser(chatId, message.from);

  if (message.document) {
    const documentSession = await prisma.botSession.findUnique({
      where: { chatId },
      select: { state: true, cart: true },
    });
    if (documentSession?.state === "AWAITING_USDT_TX_HASH") {
      await usdtBep20Flow.rejectDocument(chatId, documentSession.cart);
      return;
    }
    if (documentSession?.state === "AWAITING_BINANCE_ORDER_ID") {
      await binanceInternalFlow.rejectDocument(chatId, documentSession.cart);
      return;
    }
    await redeemFlow.handleDocument(message);
    return;
  }
  if (!text) return;

  const parts = text.split(/\s+/);
  const command = parts[0].split("@")[0].toLowerCase();
  if (text.startsWith("/")) await clearPendingQuantity(chatId);
  if (command === "/start") {
    const payload = parts[1] ?? "";
    let notice: string | undefined;
    if (payload) {
      const result = await applyReferralOnFirstJoin({
        referredChatId: chatId,
        rawCode: payload,
        isNewSession: !existingSession,
        identity,
      });
      if (result.status === "rewarded") {
        notice = result.newUserReward > 0
          ? `🎉 Referral diterima. Bonus join ${formatRupiah(result.newUserReward)} masuk ke wallet.`
          : `🎉 Referral diterima. Pengajak mendapat ${result.pointsAwarded} poin.`;
      } else if (result.status === "not_new") {
        notice = "ℹ️ Kode referral hanya berlaku saat pertama kali bergabung.";
      } else if (result.status === "self") {
        notice = "ℹ️ Kode referral sendiri tidak dapat digunakan.";
      } else if (result.status === "not_found") {
        notice = "ℹ️ Kode referral tidak ditemukan.";
      } else if (result.status === "disabled") {
        notice = "ℹ️ Program referral sedang dijeda admin.";
      }
    }
    await beginNewNavigationBubble(chatId);
    return showMenu(chatId, undefined, notice);
  }
  if (command === "/help") {
    await beginNewNavigationBubble(chatId);
    return showHelp(chatId);
  }
  if (command === "/language" || command === "/lang") {
    await beginNewNavigationBubble(chatId);
    return showLanguagePrompt(chatId);
  }
  if (command === "/catalog") {
    return catalogFlow.openCatalog(chatId);
  }
  if (command === "/community") {
    await beginNewNavigationBubble(chatId);
    return showCommunity(chatId);
  }
  if (command === "/sms") {
    await prisma.botSession.updateMany({
      where: { chatId },
      data: { smsSearchQuery: null },
    });
    await beginNewNavigationBubble(chatId);
    return smsFlow.showServices(chatId);
  }
  if (command === "/orders") {
    await beginNewNavigationBubble(chatId);
    return showOrders(chatId);
  }
  if (command === "/wallet" || command === "/balance") {
    await beginNewNavigationBubble(chatId);
    return showWallet(chatId, message.from);
  }
  if (command === "/topup") return walletTopupFlow.showOptions(chatId);
  if (command === "/referral") {
    await beginNewNavigationBubble(chatId);
    return showReferral(chatId, message.from);
  }
  if (command === "/redeem") {
    await beginNewNavigationBubble(chatId);
    return redeemFlow.start(chatId);
  }
  if (command === "/stock") return showAdminStock(chatId);
  if (command === "/subscribe") return setBroadcast(chatId, true);
  if (command === "/unsubscribe") return setBroadcast(chatId, false);
  if (command === "/myid") return sendMessage(chatId, `🪪 Chat ID kamu: ${chatId}`);
  if (shouldHandleSetEmojiCommand(command, isTelegramAdmin(chatId))) {
    return handleSetEmojiCommand({
      chatId,
      text,
      entities: message.entities,
    });
  }
  const session = await prisma.botSession.findUnique({ where: { chatId } });
  if (session?.state === "AWAITING_PRODUCT_SEARCH") {
    return catalogFlow.handleSearchInput({ chatId, text, cart: session.cart });
  }
  if (session?.state === "AWAITING_SMS_SEARCH") {
    return smsFlow.handleSearchInput({ chatId, text, cart: session.cart });
  }
  if (session?.state === "AWAITING_USDT_TX_HASH") {
    return usdtBep20Flow.submitHash({ chatId, text, cart: session.cart });
  }
  if (session?.state === "AWAITING_BINANCE_ORDER_ID") {
    return binanceInternalFlow.submitOrderId({ chatId, text, cart: session.cart });
  }
  if (session?.state === "AWAITING_REFERRAL_CODE") {
    const pending = parsePendingMessage(session.cart) as PendingReferralCode | null;
    if (!pending) {
      await clearPendingQuantity(chatId);
      return showReferral(chatId, message.from);
    }
    try {
      const code = await createOrUpdateReferralCode({
        chatId,
        code: text,
        identity,
      });
      await clearPendingQuantity(chatId);
      return showReferral(
        chatId,
        message.from,
        pending.messageId,
        `✅ Kode ${code.code} siap dibagikan.`,
      );
    } catch (error) {
      await renderNavigationMessage({
        chatId,
        messageId: pending.messageId,
        text: `❌ ${error instanceof Error ? error.message : "Kode referral tidak valid"}`,
        replyMarkup: {
          inline_keyboard: [[{ text: "⬅️ Batal", callback_data: "referral" }]],
        },
      });
      return;
    }
  }
  if (session?.state === "AWAITING_QUANTITY") {
    return catalogFlow.handleQuantityInput({
      chatId,
      text,
      cart: session.cart,
      user: message.from,
    });
  }
  if (
    session?.state === "BROWSING" &&
    await catalogFlow.handleNumberInput({ chatId, text, cart: session.cart })
  ) {
    return;
  }
  return showMenu(chatId);
}

async function handleCallback(callback: TelegramCallbackQuery) {
  if (!callback.message || !callback.data) return;
  const chatId = String(callback.message.chat.id);
  const sourceMessageId = callback.message.message_id;
  const messageId = sourceMessageId;
  const navigationMessageId = callbackNavigationMessageId(callback.message);
  // Remove Telegram's loading spinner immediately; slow provider/database work
  // continues by updating the same navigation bubble.
  await answerCallbackQuery(callback.id).catch(() => undefined);
  try {
    await rememberTelegramUser(chatId, callback.from);
    if (callback.message.document) {
      // Delivery documents are immutable product messages, not navigation
      // bubbles. Open a fresh bubble below them and never delete the document.
      await beginNewNavigationBubble(chatId, sourceMessageId);
    }
    if (
      !callback.data.startsWith("buy:") &&
      !callback.data.startsWith("qty_custom:") &&
      !callback.data.startsWith("qty:") &&
      !callback.data.startsWith("product:") &&
      !callback.data.startsWith("group:") &&
      !callback.data.startsWith("group_page:") &&
      !callback.data.startsWith("k12_redeem")
    ) {
      await clearPendingQuantity(chatId);
    }
    if (callback.data === "k12_redeem") {
      await beginNewNavigationBubble(chatId);
      await redeemFlow.start(chatId);
    }
    else if (callback.data.startsWith("k12_redeem_finish:")) {
      await redeemFlow.finish(
        chatId,
        callback.data.slice("k12_redeem_finish:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("k12_redeem_clear:")) {
      await redeemFlow.clear(
        chatId,
        callback.data.slice("k12_redeem_clear:".length),
        messageId,
      );
    }
    else if (callback.data === "k12_redeem_cancel") {
      await redeemFlow.cancel(chatId, messageId);
    }
    else if (callback.data === "menu") {
      await beginNewNavigationBubble(chatId);
      await showMenu(chatId);
    }
    else if (callback.data.startsWith("delivery_guide:")) {
      const guide = await prisma.telegramNotification.findFirst({
        where: {
          id: callback.data.slice("delivery_guide:".length), chatId,
          kind: PRODUCT_POST_DELIVERY_KIND, status: "SENT",
          order: { chatId, status: "COMPLETED", paymentStatus: "PAID" },
        },
        select: { messageText: true },
      });
      const snapshot = parseProductPostDeliverySnapshot(guide?.messageText ?? null);
      await renderNavigationMessage({
        chatId, messageId: navigationMessageId,
        text: snapshot?.messageText ?? "Panduan belum tersedia untuk akun ini.",
        entities: snapshot?.messageEntities,
        replyMarkup: { inline_keyboard: [[{ text: "Kembali ke katalog", callback_data: "catalog" }]] },
      });
    }
    else if (callback.data === "community") {
      await showCommunity(chatId, messageId);
    }
    else if (callback.data === "more") {
      await showMoreMenu(chatId, messageId);
    }
    else if (callback.data === "verify_membership") {
      await showMenu(
        chatId,
        messageId,
        "Channel hanya untuk info stok dan promo. Menu belanja tetap bisa dipakai tanpa bergabung.",
      );
    }
    else if (callback.data === "help") {
      await showHelp(chatId, messageId);
    }
    else if (callback.data === "language") {
      await showLanguagePrompt(chatId, messageId);
    }
    else if (parseTelegramLanguageCallback(callback.data)) {
      const locale = parseTelegramLanguageCallback(callback.data)!;
      await setTelegramLocale(chatId, locale);
      await showMenu(
        chatId,
        messageId,
        telegramText(locale, "languageSaved"),
      );
    }
    else if (isCatalogCallback(callback.data)) {
      await catalogFlow.handleCatalogCallback({
        data: callback.data,
        chatId,
        messageId,
        user: callback.from,
      });
    }
    else if (callback.data.startsWith("sms_")) {
      await smsFlow.handleCallback({
        id: callback.id,
        data: callback.data,
        user: callback.from,
        chatId,
        messageId,
      });
    }
    else if (callback.data === "orders") {
      await beginNewNavigationBubble(chatId);
      await showOrders(chatId);
    }
    else if (callback.data === "wallet") {
      await beginNewNavigationBubble(chatId);
      await showWallet(chatId, callback.from);
    }
    else if (callback.data === "wallet_keep_invoice") {
      await beginNewNavigationBubble(chatId, sourceMessageId);
      await showWallet(chatId, callback.from);
    }
    else if (callback.data === "topup") {
      await walletTopupFlow.showOptions(chatId, messageId);
    }
    else if (callback.data.startsWith("topup_provider:")) {
      const paymentMethod = parseWalletTopupProviderCallback(callback.data);
      if (!paymentMethod) throw new Error("Pilihan metode top up tidak valid.");
      await walletTopupFlow.showAmounts(chatId, paymentMethod, messageId);
    }
    else if (callback.data === "referral") {
      await beginNewNavigationBubble(chatId);
      await showReferral(chatId, callback.from);
    }
    else if (callback.data === "referral_create") {
      await showReferralCodePrompt(chatId, messageId);
    }
    else if (callback.data === "referral_claim") {
      const identity = normalizeBuyerIdentity({
        username: callback.from.username,
        firstName: callback.from.first_name,
        lastName: callback.from.last_name,
      });
      const result = await claimReferralReward({
        chatId,
        idempotencyKey: `telegram-referral-claim:${callback.id}`,
        identity,
      });
      const notice = result.status === "claimed"
        ? `✅ ${result.pointsSpent} poin diclaim. ${formatRupiah(result.rewardAmount)} masuk ke wallet.`
        : result.status === "insufficient_points"
          ? "🔒 Poin belum cukup untuk claim."
          : result.status === "not_configured"
            ? "ℹ️ Reward claim belum dikonfigurasi admin."
            : "ℹ️ Buat kode referral terlebih dahulu.";
      await showReferral(chatId, callback.from, messageId, notice);
    }
    else if (callback.data === "notifications") {
      await beginNewNavigationBubble(chatId);
      await showNotificationSettings(chatId);
    }
    else if (callback.data === "subscribe") {
      await setBroadcast(chatId, true, messageId);
    }
    else if (callback.data === "unsubscribe") {
      await setBroadcast(chatId, false, messageId);
    }
    else if (callback.data.startsWith("cancel_order_confirm:")) {
      await cancelOrderFromTelegram(
        chatId,
        callback.data.slice("cancel_order_confirm:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("cancel_order:")) {
      await showCancelOrderConfirmation(
        chatId,
        callback.data.slice("cancel_order:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("delivery_ack:")) {
      const orderId = callback.data.slice("delivery_ack:".length);
      await acknowledgeOrderDelivery({
        orderId,
        chatId,
      });
      await showDeliveryFeedbackResult(chatId, orderId, navigationMessageId, false);
    }
    else if (callback.data.startsWith("delivery_missing:")) {
      const orderId = callback.data.slice("delivery_missing:".length);
      await reportMissingOrderDelivery({
        orderId,
        chatId,
      });
      await showDeliveryFeedbackResult(chatId, orderId, navigationMessageId, true);
    }
    else if (callback.data.startsWith("usdt_invoice:")) {
      await usdtBep20Flow.showAttempt(
        chatId,
        callback.data.slice("usdt_invoice:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("usdt_transferred:")) {
      await usdtBep20Flow.promptForHash(
        chatId,
        callback.data.slice("usdt_transferred:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("usdt_refresh:")) {
      await usdtBep20Flow.refresh(
        chatId,
        callback.data.slice("usdt_refresh:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("binance_invoice:")) {
      await binanceInternalFlow.showAttempt(
        chatId,
        callback.data.slice("binance_invoice:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("binance_transferred:")) {
      await binanceInternalFlow.promptForOrderId(
        chatId,
        callback.data.slice("binance_transferred:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("binance_refresh:")) {
      await binanceInternalFlow.refresh(
        chatId,
        callback.data.slice("binance_refresh:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("jago_invoice:")) {
      await jagoTransferFlow.showAttempt(
        chatId,
        callback.data.slice("jago_invoice:".length),
        messageId,
      );
    }
    else if (callback.data.startsWith("shopee_refresh:")) {
      const orderId = callback.data.slice("shopee_refresh:".length);
      const refreshed = await refreshShopeePaymentForOrder({
        orderId,
        chatId,
      });
      const locale = await telegramLocaleForChat(chatId, callback.from.language_code);
      const prefix = locale === "en" ? "Shopee refresh" : "Refresh Shopee";
      await showOrder(
        chatId,
        orderId,
        navigationMessageId,
        `${prefix}: ${refreshed.message}`,
      );
    }
    else if (callback.data.startsWith("shopee_topup_refresh:")) {
      const invoiceNumber = callback.data.slice("shopee_topup_refresh:".length);
      const refreshed = await refreshShopeePaymentForWalletTopup({
        invoiceNumber,
        chatId,
      });
      const locale = await telegramLocaleForChat(chatId, callback.from.language_code);
      const prefix = locale === "en" ? "Shopee refresh" : "Refresh Shopee";
      await walletTopupFlow.showQrisInvoice({
        chatId,
        invoiceNumber,
        messageId,
        notice: `${prefix}: ${refreshed.message}`,
      });
    }
    else if (callback.data.startsWith("order:")) {
      await showOrder(
        chatId,
        callback.data.slice("order:".length),
        navigationMessageId,
      );
    }
    else if (isProductCallback(callback.data)) {
      await catalogFlow.handleProductCallback({
        data: callback.data,
        chatId,
        messageId,
        user: callback.from,
      });
    } else if (callback.data.startsWith("pay_usdt:")) {
      const selection = parseQuantityCallback(callback.data, "pay_usdt:");
      await usdtBep20Flow.startCheckout({
        chatId,
        productId: selection.productId,
        user: callback.from,
        idempotencyKey: `telegram-usdt:${callback.id}`,
        quantity: selection.quantity,
        messageId,
      });
    } else if (callback.data.startsWith("pay_binance:")) {
      const selection = parseQuantityCallback(callback.data, "pay_binance:");
      await binanceInternalFlow.startCheckout({
        chatId,
        productId: selection.productId,
        user: callback.from,
        idempotencyKey: `telegram-binance:${callback.id}`,
        quantity: selection.quantity,
        messageId,
      });
    } else if (callback.data.startsWith("pay_jago:")) {
      const selection = parseQuantityCallback(callback.data, "pay_jago:");
      await jagoTransferFlow.startCheckout({
        chatId,
        productId: selection.productId,
        user: callback.from,
        idempotencyKey: `telegram-jago:${callback.id}`,
        quantity: selection.quantity,
        messageId,
      });
    } else if (callback.data.startsWith("pay_qris:")) {
      const selection = parseQuantityCallback(callback.data, "pay_qris:");
      await startCheckout(
        chatId,
        selection.productId,
        callback.from,
        `telegram:${callback.id}`,
        "DANA",
        selection.quantity,
        messageId,
      );
    } else if (callback.data.startsWith("pay_wallet:")) {
      const selection = parseQuantityCallback(callback.data, "pay_wallet:");
      await startCheckout(
        chatId,
        selection.productId,
        callback.from,
        `telegram:${callback.id}`,
        "WALLET",
        selection.quantity,
        messageId,
      );
    } else if (callback.data.startsWith("pay_mixed:")) {
      const selection = parseQuantityCallback(callback.data, "pay_mixed:");
      await startCheckout(
        chatId,
        selection.productId,
        callback.from,
        `telegram:${callback.id}`,
        "WALLET_QRIS",
        selection.quantity,
        messageId,
      );
    } else if (callback.data.startsWith("topup:")) {
      const selection = parseWalletTopupAmountCallback(callback.data);
      if (!selection) throw new Error("Pilihan nominal top up tidak valid.");
      await walletTopupFlow.start({
        chatId,
        amount: selection.amount,
        paymentMethod: selection.paymentMethod,
        user: callback.from,
        idempotencyKey: `telegram-topup:${callback.id}`,
        messageId,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan";
    console.error("[Telegram callback] action failed", {
      action: callback.data.split(":", 1)[0],
      error: cleanError(error),
    });
    const smsCallback = callback.data.startsWith("sms_");
    if (smsCallback) {
      const smsError = resolveSmsPoolTelegramError(message);
      const text = smsError.kind === "NO_NUMBERS"
        ? `📵 Nomor tidak tersedia\n\n${smsError.message}\n\nWallet tidak dipotong. Jika proses sempat dimulai, saldo sudah dikembalikan otomatis.`
        : smsError.kind === "MAINTENANCE"
          ? `🔧 ${smsError.message}\n\nCoba lagi beberapa saat. Jika wallet sempat dipotong, saldo dikembalikan otomatis.`
          : `⚠️ ${smsError.message}`;
      await renderNavigationMessage({
        chatId,
        messageId,
        text,
        replyMarkup: {
          inline_keyboard: [
            [{ text: smsError.kind === "NO_NUMBERS" ? "🌍 Pilih alternatif" : "🔄 Coba lagi", callback_data: "sms_services:1" }],
            [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
            [{ text: "☎️ Bantuan admin", url: `tg://user?id=${TELEGRAM_ADMIN_ID}` }],
            [{ text: "⬅️ Menu utama", callback_data: "menu" }],
          ],
        },
      }).catch(() => undefined);
    } else {
      const locale = await telegramLocaleForChat(chatId, callback.from.language_code)
        .catch(() => normalizeTelegramLocale(callback.from.language_code));
      await renderNavigationMessage({
        chatId,
        messageId,
        ...callbackErrorContent(error, locale),
      }).catch(() => undefined);
    }
  }
}

export function telegramUpdateChatId(update: TelegramUpdate): string | null {
  const id = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  return id === undefined ? null : String(id);
}

export function isPrivateTelegramUpdate(update: TelegramUpdate): boolean {
  const message = update.message ?? update.callback_query?.message;
  return message?.chat.type === "private";
}

export async function handleTelegramUpdate(update: TelegramUpdate): Promise<void> {
  // Commerce data and digital delivery must never be exposed in groups/channels.
  if (!isPrivateTelegramUpdate(update)) return;

  if (update.message) await handleMessage(update.message);
  else if (update.callback_query) await handleCallback(update.callback_query);
}
