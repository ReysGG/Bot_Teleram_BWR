import { editCompletionCaption } from "@/server/telegram/completion-caption";
import { deliverInvoiceDocument } from "@/server/telegram/invoice-delivery";
import { invoiceMessageIdForDelivery } from "@/server/telegram/invoice-message-owner";
import { completedWebOrderCanAnnounce, WEB_SUCCESS_DISPATCH_MARKER } from "@/server/storefront/success-announcement";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { decryptStockFile } from "@/server/stock/inventory";
import { detectStockContent, type CredentialJson } from "@/server/stock/credential";
import {
  plainTextStockContent,
} from "@/server/stock/text-export";
import { cleanError, formatRupiah } from "@/server/utils/format";
import {
  deleteMessage,
  sendDocument,
  sendMessage,
  sendPhoto,
  TelegramApiError,
  isTelegramEntityFormatError,
  type InlineKeyboard,
} from "@/server/telegram/api";
import { refundFailedDeliveryToWallet } from "@/server/wallet/refund";
import { decryptProductAttachment } from "@/server/products/attachment";
import { telegramCatalogImageUrl } from "@/server/products/media";
import { activePublicProductWhere } from "@/server/products/visibility";
import { localizedCatalogDescription } from "@/server/products/catalog-description";
import {
  broadcastSellableHealthFilter,
  productCreatedTelegramDocument,
  productButtonTextWithCustomEmoji,
  productCustomEmojiPresentation,
  productRestockMessage,
  productSoldOutMessage,
} from "@/server/telegram/product-broadcast";
import {
  digitalPurchaseSuccessMessage,
  storefrontPublicUrl,
  smsPurchaseSuccessMessage,
  successChannelSmsOrderId,
  telegramStoreBotUrl,
} from "@/server/telegram/success-channel";
import { mainMenuContent } from "@/server/telegram/menu";
import { loadTelegramAccountSummary } from "@/server/telegram/account-summary";
import { telegramLocaleForChat } from "@/server/telegram/locale-store";
import { catalogCopy } from "@/server/telegram/catalog-copy";
import {
  digitalDeliveryCaption,
  groupedDeliveryCaption,
  paymentSuccessMessage,
} from "@/server/telegram/product-presentation";
import { walletAdjustmentNotificationText } from "@/server/wallet/notification";
import { hasSmsPoolMessage } from "@/server/smspool/order-state";
import { formatSmsPoolPhoneNumber } from "@/server/smspool/phone";
import {
  isPrivateTelegramChatId,
  telegramNotificationPrivateChatBlockReason,
} from "@/server/telegram/chat-safety";
import { lockOrderPaymentTransition } from "@/server/payment/locks";
import {
  BROADCAST_NOTIFICATION_KINDS,
  shouldSuppressFutureBroadcasts,
} from "@/server/telegram/broadcast-recipient";
import { getReengagementSettings } from "@/server/telegram/reengagement";
import { getTelegramCustomEmojiSettings } from "@/server/telegram/custom-emoji";
import {
  completedProductDeliveryDocument,
  completedProductDeliveryReplyMarkup,
  parseProductPostDeliverySnapshot,
  productGuideAttachmentPrerequisiteState,
  PRODUCT_POST_DELIVERY_KIND,
  successChannelPrerequisiteState,
} from "@/server/products/post-delivery";
import {
  ORDER_DELIVERY_FOLLOWUP_KIND,
  orderDeliveryFollowupReadiness,
  queueCompletedOrderFollowups,
  queueOrderDeliveryFollowup,
} from "@/server/telegram/order-delivery-followup";
import { adminBroadcastTelegramDocument } from "@/server/telegram/admin-broadcast";
import {
  adminMessageTelegramDocument,
  parseAdminMessageSnapshot,
} from "@/server/telegram/admin-message";
import {
  buildDeliveryBundleContent,
  buildBoundedDeliveryChunks,
  digitalDeliveryClaimTake,
  deliveryBundleFormatFor,
  deliveryBundleFilename,
} from "@/server/telegram/delivery-bundle";
import { renderNavigationMessage } from "@/server/telegram/navigation";

const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function telegramErrorCanRetry(error: unknown) {
  return !(error instanceof TelegramApiError) || error.retryable;
}

export function digitalDeliveryOutcomeAmbiguous(error: unknown) {
  return error instanceof TelegramApiError && (
    !error.responseReceived || (error.statusCode !== undefined && error.statusCode >= 500)
  );
}

export function digitalDeliveryFailureAllowsAutomaticRefund(error: unknown) {
  if (!(error instanceof TelegramApiError) || !error.responseReceived) {
    return false;
  }
  if (error.statusCode !== 400 && error.statusCode !== 403) {
    return false;
  }
  // Refund only when Telegram explicitly proves the private recipient cannot
  // receive any message. File, caption, button, size, configuration, crypto,
  // and application failures require operator recovery instead.
  return /(?:chat not found|bot was blocked by the user|user is deactivated|bot can(?:not|'t) initiate conversation|have no rights to send (?:a )?message)/i.test(
    error.message,
  );
}

/**
 * Convert an uncaught worker error into a terminal/retry state.  Every
 * notification is claimed before its handler runs; without this guard a
 * malformed stock row or a transient database error leaves it PROCESSING
 * until the five-minute lease expires and aborts the rest of the batch.
 */
export function unhandledNotificationState(input: {
  attempts: number;
  ambiguous: boolean;
  retryable?: boolean;
}) {
  if (input.ambiguous) return "MANUAL_REVIEW" as const;
  return input.retryable !== false && input.attempts < MAX_ATTEMPTS
    ? ("PENDING" as const)
    : ("FAILED" as const);
}

export function notificationWorkerSlots(batchSize: number, requested = 3) {
  const normalizedBatch = Math.max(0, Math.trunc(batchSize));
  if (normalizedBatch === 0) return 0;
  const normalizedRequested = Number.isFinite(requested)
    ? Math.trunc(requested)
    : 1;
  // Telegram permits much more throughput, but this conservative cap keeps
  // database usage bounded when several cron containers overlap.
  return Math.min(normalizedBatch, Math.max(1, Math.min(6, normalizedRequested)));
}

export function deliveryReceiptAllowsSend(
  status: "NEW" | "FAILED" | "SENDING" | "SENT" | "UNKNOWN",
): boolean {
  return status === "NEW" || status === "FAILED";
}

export function failedReceiptCanMoveToPaidOrder(input: {
  receiptStatus: string;
  telegramMessageId: string | null;
  sentAt: Date | null;
  previousOrderStatus: string;
  previousOrderRefundedAt: Date | null;
  stockStatus: string;
  reservedOrderId: string | null;
  targetOrderId: string;
  targetHasStockItem: boolean;
}) {
  return (
    input.receiptStatus === "FAILED" &&
    input.telegramMessageId === null &&
    input.sentAt === null &&
    (input.previousOrderStatus === "REFUNDED" ||
      input.previousOrderRefundedAt !== null) &&
    input.stockStatus === "RESERVED" &&
    input.reservedOrderId === input.targetOrderId &&
    input.targetHasStockItem
  );
}

export function recoverableDeliveryReceiptCollisionError(error: string | null) {
  return Boolean(
    error &&
      /sentDelivery\.create|sentDelivery\.upsert/i.test(error) &&
      /unique constraint failed/i.test(error) &&
      /stockItemId/i.test(error),
  );
}

export function orderAllowsDigitalDelivery(input: {
  status: string;
  paymentStatus: string;
}): boolean {
  return input.status === "FULFILLING" && input.paymentStatus === "PAID";
}

export function allOrderUnitsDelivered(
  statuses: Array<string | null | undefined>,
): boolean {
  return statuses.length > 0 && statuses.every((status) => status === "DELIVERED");
}

export function deliveredStockState(orderId: string, deliveredAt: Date) {
  return {
    status: "DELIVERED" as const,
    deliveredOrderId: orderId,
    deliveredAt,
    archivedAt: null,
  };
}

export function notificationClaimWhere(
  now: Date,
  activeChatIds: string[],
): Prisma.TelegramNotificationWhereInput {
  return {
    AND: [
      {
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "PROCESSING", leaseUntil: { lte: now } },
        ],
      },
      ...(activeChatIds.length > 0
        ? [{ chatId: { notIn: activeChatIds } }]
        : []),
    ],
  };
}

async function claimNextNotification() {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT pg_advisory_xact_lock(hashtext('telegram_notification_claim'))",
    );
    const now = new Date();
    const activeChats = await tx.telegramNotification.findMany({
      where: { status: "PROCESSING", leaseUntil: { gt: now } },
      select: { chatId: true },
      distinct: ["chatId"],
    });
    const notification = await tx.telegramNotification.findFirst({
      where: notificationClaimWhere(
        now,
        activeChats.map((item) => item.chatId),
      ),
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    if (!notification) return null;

    const leaseUntil = new Date(now.getTime() + LEASE_MS);
    if (notification.kind === "DIGITAL_FILE" && notification.orderId) {
      const deliveryNotifications = await tx.telegramNotification.findMany({
        where: {
          orderId: notification.orderId,
          kind: "DIGITAL_FILE",
          OR: [
            { status: "PENDING", nextAttemptAt: { lte: now } },
            { status: "PROCESSING", leaseUntil: { lte: now } },
          ],
        },
        select: { id: true },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        take: digitalDeliveryClaimTake(),
      });
      const deliveryNotificationIds = deliveryNotifications.map((item) => item.id);
      await tx.telegramNotification.updateMany({
        where: { id: { in: deliveryNotificationIds } },
        data: {
          status: "PROCESSING",
          attempts: { increment: 1 },
          leaseUntil,
          lastError: null,
        },
      });
      const claimed = await tx.telegramNotification.findUniqueOrThrow({
        where: { id: notification.id },
      });
      return { ...claimed, deliveryNotificationIds };
    }

    const claimed = await tx.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        leaseUntil,
        lastError: null,
      },
    });
    return { ...claimed, deliveryNotificationIds: [claimed.id] };
  });
}

async function reserveDeliveryReceipt(notification: {
  id: string;
  dedupeKey: string;
  orderId: string | null;
  stockItemId: string | null;
  chatId: string;
}) {
  if (!notification.orderId || !notification.stockItemId) {
    throw new Error("Digital delivery notification is incomplete");
  }

  const reserveWithLock = async (tx: Prisma.TransactionClient) => {
    await lockOrderPaymentTransition(tx, notification.orderId!);
    const [order, existing, existingForStock, stock] = await Promise.all([
      tx.order.findUnique({
        where: { id: notification.orderId! },
        select: {
          status: true,
          paymentStatus: true,
          items: {
            where: { stockItemId: notification.stockItemId! },
            select: { id: true },
            take: 1,
          },
        },
      }),
      tx.sentDelivery.findUnique({
        where: { dedupeKey: notification.dedupeKey },
      }),
      tx.sentDelivery.findUnique({
        where: { stockItemId: notification.stockItemId! },
        include: {
          order: { select: { status: true, refundedAt: true } },
        },
      }),
      tx.digitalStockItem.findUnique({
        where: { id: notification.stockItemId! },
        select: { status: true, reservedOrderId: true },
      }),
    ]);
    if (!order || !stock) throw new Error("Digital delivery order or stock not found");

    const deliveryAllowed = orderAllowsDigitalDelivery(order);
    const blockedReason = deliveryAllowed
      ? null
      : `Digital delivery blocked because order is ${order.status}/${order.paymentStatus}`;

    if (existing) {
      if (existing.status === "FAILED" && deliveryAllowed) {
        const receipt = await tx.sentDelivery.update({
          where: { id: existing.id },
          data: { status: "SENDING", lastError: null },
        });
        return { receipt, canSend: deliveryReceiptAllowsSend("FAILED"), blockedReason };
      }
      return {
        receipt: existing,
        canSend: false,
        blockedReason: existing.status === "FAILED" ? blockedReason : null,
      };
    }

    if (existingForStock) {
      const canMoveReceipt =
        deliveryAllowed &&
        failedReceiptCanMoveToPaidOrder({
          receiptStatus: existingForStock.status,
          telegramMessageId: existingForStock.telegramMessageId,
          sentAt: existingForStock.sentAt,
          previousOrderStatus: existingForStock.order.status,
          previousOrderRefundedAt: existingForStock.order.refundedAt,
          stockStatus: stock.status,
          reservedOrderId: stock.reservedOrderId,
          targetOrderId: notification.orderId!,
          targetHasStockItem: order.items.length === 1,
        });
      if (!canMoveReceipt) {
        return {
          receipt: existingForStock,
          canSend: false,
          blockedReason:
            "Digital delivery blocked because this stock already has a non-reusable delivery receipt",
        };
      }

      const moved = await tx.sentDelivery.updateMany({
        where: {
          id: existingForStock.id,
          status: "FAILED",
          telegramMessageId: null,
          sentAt: null,
        },
        data: {
          dedupeKey: notification.dedupeKey,
          orderId: notification.orderId!,
          chatId: notification.chatId,
          status: "SENDING",
          lastError: null,
        },
      });
      if (moved.count !== 1) {
        throw new Error("Delivery receipt changed during safe reassignment");
      }
      return {
        receipt: await tx.sentDelivery.findUniqueOrThrow({
          where: { dedupeKey: notification.dedupeKey },
        }),
        canSend: true,
        blockedReason: null,
      };
    }

    if (!deliveryAllowed) {
      return { receipt: null, canSend: false, blockedReason };
    }

    const receipt = await tx.sentDelivery.create({
      data: {
        dedupeKey: notification.dedupeKey,
        orderId: notification.orderId!,
        stockItemId: notification.stockItemId!,
        chatId: notification.chatId,
      },
    });
    return {
      receipt,
      canSend: deliveryReceiptAllowsSend("NEW"),
      blockedReason: null,
    };
  };

  try {
    return await prisma.$transaction(reserveWithLock);
  } catch (error) {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2002"
    ) {
      throw error;
    }
    // A rolling deployment can briefly race an older worker that does not use
    // the order lock. Re-read under the lock instead of risking another send.
    return prisma.$transaction(reserveWithLock);
  }
}

async function requeueRecoverableDeliveryReceiptCollisions(limit = 25) {
  const candidates = await prisma.telegramNotification.findMany({
    where: {
      kind: "DIGITAL_FILE",
      status: { in: ["FAILED", "PENDING"] },
      stockItemId: { not: null },
      lastError: { contains: "stockItemId" },
      order: { is: { status: "FULFILLING", paymentStatus: "PAID" } },
    },
    select: { id: true, lastError: true },
    orderBy: { updatedAt: "asc" },
    take: Math.max(0, Math.min(100, Math.trunc(limit))),
  });
  const ids = candidates
    .filter((candidate) => recoverableDeliveryReceiptCollisionError(candidate.lastError))
    .map((candidate) => candidate.id);
  if (ids.length === 0) return 0;

  const queued = await prisma.telegramNotification.updateMany({
    where: { id: { in: ids }, status: { in: ["FAILED", "PENDING"] } },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      lastError: "Retry otomatis setelah perbaikan receipt stok gagal",
    },
  });
  return queued.count;
}

async function markDigitalDeliveryBlocked(
  notificationIds: string[],
  reason: string,
) {
  await prisma.telegramNotification.updateMany({
    where: { id: { in: notificationIds }, status: "PROCESSING" },
    data: {
      status: "FAILED",
      leaseUntil: null,
      lastError: reason,
    },
  });
}

async function markSensitiveNotificationBlocked(
  notification: { id: string },
  reason: string,
) {
  await prisma.telegramNotification.updateMany({
    where: { id: notification.id, status: "PROCESSING" },
    data: {
      status: "MANUAL_REVIEW",
      leaseUntil: null,
      lastError: reason,
    },
  });
}

async function markSensitiveNotificationsBlocked(
  notifications: Array<{ id: string }>,
  reason: string,
) {
  await prisma.telegramNotification.updateMany({
    where: {
      id: { in: notifications.map((notification) => notification.id) },
      status: "PROCESSING",
    },
    data: {
      status: "MANUAL_REVIEW",
      leaseUntil: null,
      lastError: reason,
    },
  });
}

async function requeueWaitingNotification(
  notification: { id: string },
  reason: string,
) {
  await prisma.telegramNotification.updateMany({
    where: { id: notification.id, status: "PROCESSING" },
    data: {
      status: "PENDING",
      attempts: { decrement: 1 },
      nextAttemptAt: new Date(Date.now() + 5_000),
      leaseUntil: null,
      lastError: reason,
    },
  });
}

async function loadCustomerFollowupOrder(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      chatId: true,
      invoiceNumber: true,
      grandTotal: true,
      status: true,
      paymentStatus: true,
      payment: { select: { status: true } },
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          productId: true,
          productNameSnapshot: true,
          stockItemId: true,
        },
      },
      deliveryReceipts: {
        select: { stockItemId: true, chatId: true, status: true },
      },
    },
  });
}

async function customerFollowupGate(
  notification: { id: string; orderId: string | null; chatId: string },
) {
  if (!notification.orderId) {
    await markSensitiveNotificationBlocked(
      notification,
      "Customer follow-up notification has no order",
    );
    return { outcome: "manual_review" as const, order: null };
  }
  const order = await loadCustomerFollowupOrder(notification.orderId);
  if (
    !order ||
    !isPrivateTelegramChatId(order.chatId) ||
    order.chatId !== notification.chatId
  ) {
    await markSensitiveNotificationBlocked(
      notification,
      "Customer follow-up recipient does not match the private order owner",
    );
    return { outcome: "manual_review" as const, order: null };
  }
  const readiness = orderDeliveryFollowupReadiness({
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentProviderStatus: order.payment?.status ?? null,
    stockItemIds: order.items.map((item) => item.stockItemId),
    receipts: order.deliveryReceipts,
    chatId: order.chatId,
  });
  if (readiness.state === "WAITING") {
    await requeueWaitingNotification(
      notification,
      readiness.reason ?? "Customer follow-up is waiting for delivery",
    );
    return { outcome: "retry" as const, order: null };
  }
  if (readiness.state === "BLOCKED") {
    await markSensitiveNotificationBlocked(
      notification,
      readiness.reason ?? "Customer follow-up is not allowed",
    );
    return { outcome: "manual_review" as const, order: null };
  }
  return { outcome: "ready" as const, order };
}

function nextAttempt(attempts: number, retryAfterSeconds?: number): Date {
  const seconds = retryAfterSeconds ?? Math.min(3600, 2 ** attempts * 60);
  return new Date(Date.now() + seconds * 1000);
}

export function permanentRecipientSessionUpdate() {
  return { broadcastEnabled: false, telegramReachable: false } as const;
}

export function permanentRecipientSessionWhere(chatId: string) {
  return { chatId } as const;
}

async function sendNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  send: () => Promise<{ message_id: number }>,
  afterSend?: () => Promise<void>,
  failClosedAfterAccepted = false,
) {
  try {
    await send();
  } catch (error) {
    const errorMessage = cleanError(error);
    const ambiguous = error instanceof TelegramApiError && (
      !error.responseReceived ||
      (failClosedAfterAccepted &&
        error.statusCode !== undefined &&
        error.statusCode >= 500)
    );
    const suppressFutureBroadcasts = shouldSuppressFutureBroadcasts({
      kind: notification.kind,
      error,
    });
    const shouldRetry =
      !ambiguous && telegramErrorCanRetry(error) && notification.attempts < MAX_ATTEMPTS;
    const notificationUpdate = prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: ambiguous
          ? "MANUAL_REVIEW"
          : shouldRetry
            ? "PENDING"
            : "FAILED",
        nextAttemptAt: nextAttempt(
          notification.attempts,
          error instanceof TelegramApiError ? error.retryAfterSeconds : undefined,
        ),
        leaseUntil: null,
        lastError: errorMessage,
      },
    });
    if (suppressFutureBroadcasts) {
      await prisma.$transaction([
        notificationUpdate,
        // Do not spend worker capacity retrying other catalog broadcasts for
        // a recipient Telegram has permanently rejected.
        prisma.telegramNotification.updateMany({
          where: {
            id: { not: notification.id },
            chatId: notification.chatId,
            status: "PENDING",
            kind: { in: [...BROADCAST_NOTIFICATION_KINDS] },
          },
          data: {
            status: "FAILED",
            leaseUntil: null,
            lastError: "Penerima Telegram dinonaktifkan dari broadcast",
          },
        }),
        prisma.botSession.updateMany({
          where: permanentRecipientSessionWhere(notification.chatId),
          data: permanentRecipientSessionUpdate(),
        }),
      ]);
    } else {
      await notificationUpdate;
    }
    if (ambiguous) return "manual_review" as const;
    return shouldRetry ? ("retry" as const) : ("failed" as const);
  }

  await afterSend?.().catch(() => undefined);
  try {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
  } catch (error) {
    if (!failClosedAfterAccepted) throw error;
    await prisma.telegramNotification.updateMany({
      where: { id: notification.id },
      data: {
        status: "MANUAL_REVIEW",
        leaseUntil: null,
        lastError: "Telegram accepted post-delivery instructions but final commit failed",
      },
    }).catch(() => undefined);
    return "manual_review" as const;
  }
  return "sent" as const;
}

async function sendTextNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  message: string,
  replyMarkup?: InlineKeyboard,
  afterSend?: () => Promise<void>,
  entities?: Parameters<typeof sendMessage>[3],
  failClosedAfterAccepted = false,
) {
  return sendNotification(
    notification,
    () => sendMessage(notification.chatId, message, replyMarkup, entities),
    afterSend,
    failClosedAfterAccepted,
  );
}

async function sendNavigationNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  message: string,
  replyMarkup?: InlineKeyboard,
  afterSend?: () => Promise<void>,
  entities?: Parameters<typeof sendMessage>[3],
  failClosedAfterAccepted = false,
) {
  return sendNotification(
    notification,
    () => renderNavigationMessage({
      chatId: notification.chatId,
      text: message,
      replyMarkup,
      entities,
    }),
    afterSend,
    failClosedAfterAccepted,
  );
}

async function customEmojiPresentationForProductText(message: string) {
  try {
    const customEmojiSettings = await getTelegramCustomEmojiSettings();
    return productCustomEmojiPresentation({
      text: message,
      name: message,
      settings: customEmojiSettings,
    });
  } catch (error) {
    console.warn("[Telegram custom emoji settings]", cleanError(error));
    return { text: message, entities: [], iconCustomEmojiId: undefined };
  }
}

function decorateProductReplyMarkup(
  replyMarkup: InlineKeyboard,
  iconCustomEmojiId?: string,
) {
  if (!iconCustomEmojiId) return replyMarkup;
  return {
    ...replyMarkup,
    inline_keyboard: replyMarkup.inline_keyboard.map((row, rowIndex) =>
      row.map((button, buttonIndex) =>
        rowIndex === 0 && buttonIndex === 0
          ? {
              ...button,
              text: productButtonTextWithCustomEmoji(
                button.text,
                iconCustomEmojiId,
              ),
              icon_custom_emoji_id: iconCustomEmojiId,
            }
          : button,
      ),
    ),
  };
}

async function sendProductTextNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  message: string,
  replyMarkup: InlineKeyboard,
) {
  const presentation = await customEmojiPresentationForProductText(message);
  return sendTextNotification(
    notification,
    presentation.text,
    decorateProductReplyMarkup(replyMarkup, presentation.iconCustomEmojiId),
    undefined,
    presentation.entities,
  );
}

async function sendPreparedProductTextNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  presentation: {
    text: string;
    entities: Parameters<typeof sendMessage>[3];
    iconCustomEmojiId?: string;
  },
  replyMarkup: InlineKeyboard,
) {
  return sendTextNotification(
    notification,
    presentation.text,
    decorateProductReplyMarkup(replyMarkup, presentation.iconCustomEmojiId),
    undefined,
    presentation.entities,
  );
}

async function sendPreparedProductPhotoNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
  photoUrl: string,
  presentation: {
    text: string;
    entities: Parameters<typeof sendMessage>[3];
    iconCustomEmojiId?: string;
  },
  replyMarkup: InlineKeyboard,
) {
  const decoratedReplyMarkup = decorateProductReplyMarkup(
    replyMarkup,
    presentation.iconCustomEmojiId,
  );
  return sendNotification(notification, async () => {
    try {
      return await sendPhoto(
        notification.chatId,
        photoUrl,
        presentation.text,
        decoratedReplyMarkup,
        presentation.entities,
      );
    } catch (error) {
      if (
        !(error instanceof TelegramApiError) ||
        !error.responseReceived ||
        (error.statusCode !== 400 && error.statusCode !== 413)
      ) {
        throw error;
      }
      return sendMessage(
        notification.chatId,
        presentation.text,
        decoratedReplyMarkup,
        presentation.entities,
      );
    }
  });
}

async function quarantineExpiredPostDeliveryLeases() {
  const quarantined = await prisma.telegramNotification.updateMany({
    where: {
      kind: PRODUCT_POST_DELIVERY_KIND,
      status: "PROCESSING",
      leaseUntil: { lte: new Date() },
    },
    data: {
      status: "MANUAL_REVIEW",
      leaseUntil: null,
      lastError: "Post-delivery send outcome is unknown; automatic resend was blocked",
    },
  });
  return quarantined.count;
}

export function recoverablePostDeliverySnapshot(input: {
  lastError: string | null;
  messageText: string | null;
}) {
  return (
    input.lastError === "Product post-delivery notification snapshot is invalid" &&
    parseProductPostDeliverySnapshot(input.messageText) !== null
  );
}

async function requeueRecoverablePostDeliverySnapshots(limit = 25) {
  const invalidSnapshotError = "Product post-delivery notification snapshot is invalid";
  const candidates = await prisma.telegramNotification.findMany({
    where: {
      kind: PRODUCT_POST_DELIVERY_KIND,
      status: "FAILED",
      lastError: invalidSnapshotError,
      messageText: { not: null },
    },
    select: { id: true, messageText: true },
    orderBy: { updatedAt: "asc" },
    take: Math.max(0, Math.min(100, Math.trunc(limit))),
  });
  const ids = candidates
    .filter((candidate) => recoverablePostDeliverySnapshot({
      lastError: invalidSnapshotError,
      messageText: candidate.messageText,
    }))
    .map((candidate) => candidate.id);
  if (ids.length === 0) return 0;

  const requeued = await prisma.telegramNotification.updateMany({
    where: {
      id: { in: ids },
      kind: PRODUCT_POST_DELIVERY_KIND,
      status: "FAILED",
      lastError: invalidSnapshotError,
    },
    data: {
      status: "PENDING",
      attempts: 0,
      nextAttemptAt: new Date(),
      leaseUntil: null,
      lastError: null,
    },
  });
  return requeued.count;
}

export async function processPaymentSuccess(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.orderId) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Payment success notification has no order",
      },
    });
    return "failed" as const;
  }

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: notification.orderId },
    include: { payment: true, items: true },
  });
  if (!order.payment) throw new Error("Payment record not found");
  if (order.payment.telegramInvoiceMessageId && ["FULFILLING", "COMPLETED"].includes(order.status)) {
    // The ready product replaces this invoice; do not delete it or create a
    // second success bubble before the sensitive delivery worker uploads.
    await prisma.telegramNotification.update({ where: { id: notification.id }, data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null } });
    return "sent" as const;
  }
  const locale = await telegramLocaleForChat(notification.chatId);
  const message = paymentSuccessMessage({
    invoiceNumber: order.invoiceNumber,
    quantity: order.items.length,
    grandTotal: order.grandTotal,
    isPreorder: order.isPreorder,
    preorderEtaText: order.preorderEtaText,
    locale,
  });

  return sendNavigationNotification(notification, message, undefined, async () => {
    if (!order.payment?.telegramInvoiceMessageId) return;
    await deleteMessage(notification.chatId, order.payment.telegramInvoiceMessageId);
  });
}

async function processProductAnnouncement(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.productId) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Product announcement has no product",
      },
    });
    return "failed" as const;
  }
  const product = await prisma.product.findFirst({
    where: activePublicProductWhere(notification.productId),
    include: { group: { select: { name: true } } },
  });
  if (!product) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
    return "sent" as const;
  }
  const availableNow = await prisma.digitalStockItem.count({
    where: {
      productId: product.id,
      archivedAt: null,
      status: "AVAILABLE",
      ...broadcastSellableHealthFilter(),
    },
  });
  const locale = await telegramLocaleForChat(notification.chatId);
  const localizedDescription = localizedCatalogDescription({
    locale,
    description: product.description,
    descriptionEntities: product.descriptionEntities,
    descriptionEn: product.descriptionEn,
    descriptionEntitiesEn: product.descriptionEntitiesEn,
  });
  const copy = catalogCopy(locale);
  let customEmojiSettings;
  try {
    customEmojiSettings = await getTelegramCustomEmojiSettings();
  } catch (error) {
    console.warn("[Telegram custom emoji settings]", cleanError(error));
    customEmojiSettings = {
      chatgptCustomEmojiId: null,
      claudeCustomEmojiId: null,
      updatedBy: null,
      updatedAt: null,
    };
  }
  const photoUrl = telegramCatalogImageUrl({
    kind: "product",
    id: product.id,
    imageUrl: product.imageUrl,
  });
  const presentation = productCreatedTelegramDocument({
    name: product.name,
    price: product.price,
    description: localizedDescription.description,
    descriptionEntities: localizedDescription.descriptionEntities,
    availableNow,
    preorderEtaText: product.preorderEnabled ? product.preorderEtaText : null,
    groupName: product.group?.name,
    variantLabel: product.variantLabel,
    locale,
    settings: customEmojiSettings,
    maxTextLength: photoUrl ? 1_024 : undefined,
  });
  const replyMarkup: InlineKeyboard = {
      inline_keyboard: [
        [{ text: `⚡ ${copy.buyNow}`, callback_data: `product:${product.id}` }],
        [{ text: `🛍️ ${copy.viewAllProducts}`, callback_data: "catalog" }],
      ],
    };
  return photoUrl
    ? sendPreparedProductPhotoNotification(
        notification,
        photoUrl,
        presentation,
        replyMarkup,
      )
    : sendPreparedProductTextNotification(
        notification,
        presentation,
        replyMarkup,
      );
}

async function processProductRestock(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.productId) {
    throw new Error("Product restock notification has no product");
  }
  const product = await prisma.product.findFirst({
    where: activePublicProductWhere(notification.productId),
    include: { group: { select: { name: true } } },
  });
  if (!product) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
    return "sent" as const;
  }
  const availableNow = await prisma.digitalStockItem.count({
    where: {
      productId: product.id,
      archivedAt: null,
      status: "AVAILABLE",
      ...broadcastSellableHealthFilter(),
    },
  });
  const addedCount = Math.max(
    1,
    Number.parseInt(notification.messageText ?? "1", 10) || 1,
  );
  const locale = await telegramLocaleForChat(notification.chatId);
  const copy = catalogCopy(locale);
  return sendProductTextNotification(notification, productRestockMessage({
    name: product.name,
    price: product.price,
    addedCount,
    availableNow,
    groupName: product.group?.name,
    variantLabel: product.variantLabel,
    locale,
  }), {
    inline_keyboard: [
      [{ text: `⚡ ${copy.buyNow}`, callback_data: `product:${product.id}` }],
      [{ text: `🛍️ ${copy.viewAllProducts}`, callback_data: "catalog" }],
    ],
  });
}

async function processProductSoldOut(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.productId) {
    throw new Error("Product sold-out notification has no product");
  }
  const product = await prisma.product.findFirst({
    where: activePublicProductWhere(notification.productId),
    include: { group: { select: { name: true } } },
  });
  if (!product) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
    return "sent" as const;
  }
  const [availableNow, reservedNow] = await Promise.all([
    prisma.digitalStockItem.count({
      where: {
        productId: product.id,
        archivedAt: null,
        status: "AVAILABLE",
        ...broadcastSellableHealthFilter(),
      },
    }),
    prisma.digitalStockItem.count({
      where: {
        productId: product.id,
        archivedAt: null,
        status: "RESERVED",
        ...broadcastSellableHealthFilter(),
      },
    }),
  ]);
  if (availableNow > 0) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null },
    });
    return "sent" as const;
  }
  const locale = await telegramLocaleForChat(notification.chatId);
  const copy = catalogCopy(locale);
  return sendProductTextNotification(
    notification,
    productSoldOutMessage({
      name: product.name,
      price: product.price,
      reservedNow,
      preorderEtaText: product.preorderEnabled ? product.preorderEtaText : null,
      groupName: product.group?.name,
      variantLabel: product.variantLabel,
      locale,
    }),
    {
      inline_keyboard: [
        [{ text: `🧩 ${copy.viewProduct}`, callback_data: `product:${product.id}` }],
        [{ text: `🛍️ ${copy.viewCatalog}`, callback_data: "catalog" }],
      ],
    },
  );
}

async function processWalletTopupSuccess(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.walletTopupId) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Wallet top up notification has no top up",
      },
    });
    return "failed" as const;
  }
  const topup = await prisma.walletTopup.findUniqueOrThrow({
    where: { id: notification.walletTopupId },
    include: { wallet: true },
  });
  const message = [
    "✅ Top up saldo berhasil!",
    "",
    `🧾 Invoice: ${topup.invoiceNumber}`,
    `➕ Saldo masuk: ${formatRupiah(topup.baseAmount)}`,
    `💰 Saldo sekarang: ${formatRupiah(topup.wallet.balance)}`,
  ].join("\n");
  return sendTextNotification(notification, message, {
    inline_keyboard: [
      [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
      [{ text: "🛍️ Belanja", callback_data: "catalog" }],
    ],
  }, async () => {
    if (!topup.telegramInvoiceMessageId) return;
    await deleteMessage(notification.chatId, topup.telegramInvoiceMessageId);
  });
}

async function processWalletRefund(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.orderId) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Wallet refund notification has no order",
      },
    });
    return "failed" as const;
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: notification.orderId },
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { chatId: order.chatId },
  });
  const reason =
    notification.messageText === "STOCK_UNAVAILABLE"
      ? "Stok keburu habis sebelum pembayaran terkonfirmasi. Dana penuh sudah masuk ke wallet kamu."
      : "Pengiriman file gagal secara pasti, jadi dana aman dikembalikan ke wallet kamu.";
  return sendTextNotification(
    notification,
    [
      "↩️ Dana dikembalikan ke saldo.",
      "",
      `🧾 Invoice: ${order.invoiceNumber}`,
      `➕ Refund: ${formatRupiah(order.grandTotal)}`,
      `💰 Saldo sekarang: ${formatRupiah(wallet.balance)}`,
      reason,
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
        [{ text: "🛍️ Pilih produk lain", callback_data: "catalog" }],
      ],
    },
  );
}

async function processPreorderCancellation(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.orderId) {
    throw new Error("Preorder cancellation notification has no order");
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: notification.orderId },
  });
  const wallet = await prisma.wallet.findUniqueOrThrow({
    where: { chatId: order.chatId },
  });
  return sendTextNotification(
    notification,
    [
      "↩️ Preorder dibatalkan oleh admin.",
      "",
      `🧾 Invoice: ${order.invoiceNumber}`,
      `➕ Refund ke wallet: ${formatRupiah(order.grandTotal)}`,
      `💰 Saldo sekarang: ${formatRupiah(wallet.balance)}`,
      `📝 Alasan: ${notification.messageText ?? "Tidak dicantumkan"}`,
    ].join("\n"),
    {
      inline_keyboard: [
        [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
        [{ text: "🛍️ Lihat katalog", callback_data: "catalog" }],
      ],
    },
  );
}

async function processAdminMessage(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.orderId || !notification.messageText) {
    throw new Error("Admin message notification is incomplete");
  }
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: notification.orderId },
  });
  if (order.chatId !== notification.chatId) {
    await markSensitiveNotificationBlocked(
      notification,
      "Admin message recipient does not match the order owner",
    );
    return "manual_review" as const;
  }
  const snapshot = parseAdminMessageSnapshot(notification.messageText);
  if (!snapshot) throw new Error("Admin message snapshot is invalid");
  const document = adminMessageTelegramDocument({
    invoiceNumber: order.invoiceNumber,
    snapshot,
  });
  return sendTextNotification(
    notification,
    document.text,
    {
      inline_keyboard: [
        [{ text: "📦 Lihat order", callback_data: `order:${order.id}` }],
        [{ text: "🏠 Menu utama", callback_data: "menu" }],
      ],
    },
    undefined,
    document.entities,
  );
}

async function processSystemAlert(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.messageText) {
    throw new Error("System alert notification is incomplete");
  }
  return sendTextNotification(
    notification,
    [
      "⚠️ BWR Tele • Monitoring",
      "",
      notification.messageText,
    ].join("\n"),
  );
}

async function processSmsOtpSuccess(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.messageText) {
    throw new Error("SMS OTP notification is incomplete");
  }
  if (!isPrivateTelegramChatId(notification.chatId)) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Sensitive SMS OTP notification was blocked for a non-private chat",
      },
    });
    return "failed" as const;
  }
  const order = await prisma.smsPoolCustomerOrder.findUniqueOrThrow({
    where: { id: notification.messageText },
  });
  if (order.chatId !== notification.chatId) {
    await markSensitiveNotificationBlocked(
      notification,
      "SMS OTP recipient does not match the order owner",
    );
    return "manual_review" as const;
  }
  if (!hasSmsPoolMessage(order)) {
    throw new Error("SMS OTP is not available yet");
  }
  const phoneNumber = formatSmsPoolPhoneNumber(order.phoneNumber, order.countryCode);
  return sendTextNotification(
    notification,
    [
      "✅ OTP diterima",
      "",
      `📱 Aplikasi: ${order.serviceName}`,
      `🌍 Negara: ${order.countryName}`,
      `☎️ Nomor: ${phoneNumber ?? "-"}`,
      `🔐 OTP: ${order.otpCode ?? "Tersedia di pesan lengkap"}`,
      order.fullCode && order.fullCode !== order.otpCode
        ? `💬 Pesan: ${order.fullCode}`
        : null,
    ].filter(Boolean).join("\n"),
    {
      inline_keyboard: [
        [{ text: "📲 Buka detail", callback_data: `sms_order:${order.id}` }],
        [
          { text: "📲 Nomor aktif", callback_data: "sms_orders" },
          { text: "📚 Riwayat", callback_data: "sms_history:1" },
        ],
      ],
    },
  );
}

async function processWalletAdjustment(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.messageText) {
    throw new Error("Wallet adjustment notification is incomplete");
  }
  return sendTextNotification(
    notification,
    walletAdjustmentNotificationText(notification.messageText),
    {
      inline_keyboard: [
        [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
        [{ text: "🏠 Menu utama", callback_data: "menu" }],
      ],
    },
  );
}

async function processReferralReward(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.messageText) {
    throw new Error("Referral reward notification is incomplete");
  }
  const payload = JSON.parse(notification.messageText) as {
    role?: "referrer" | "new_user";
    code?: string;
    amount?: number;
    points?: number;
    pointBalance?: number;
  };
  const amount = Number.isSafeInteger(payload.amount) ? Number(payload.amount) : 0;
  const text = payload.role === "referrer"
    ? [
        "🎯 Poin referral bertambah!",
        "",
        `Kode: ${payload.code ?? "-"}`,
        `Poin baru: +${payload.points ?? 0}`,
        `Saldo poin: ${payload.pointBalance ?? 0}`,
        "User baru berhasil bergabung melalui link kamu.",
      ]
    : [
        "🎉 Selamat datang di BWR Tele!",
        "",
        `Kode referral: ${payload.code ?? "-"}`,
        `Bonus join: ${formatRupiah(amount)}`,
        "Bonus sudah masuk ke wallet kamu.",
      ];
  return sendTextNotification(notification, text.join("\n"), {
    inline_keyboard: [
      [{ text: "💰 Lihat wallet", callback_data: "wallet" }],
      [{ text: "🤝 Referral saya", callback_data: "referral" }],
      [{ text: "🏠 Menu utama", callback_data: "menu" }],
    ],
  });
}

async function processAdminBroadcast(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.broadcastId) {
    throw new Error("Admin broadcast notification is incomplete");
  }
  const broadcast = await prisma.adminBroadcast.findUniqueOrThrow({
    where: { id: notification.broadcastId },
  });
  const document = adminBroadcastTelegramDocument(broadcast);
  return sendTextNotification(
    notification,
    document.text,
    {
      inline_keyboard: [
        [{ text: "🛍️ Lihat produk", callback_data: "catalog" }],
        [{ text: "🏠 Menu utama", callback_data: "menu" }],
      ],
    },
    undefined,
    document.entities,
  );
}

export function reengagementReplyMarkup(): InlineKeyboard {
  return {
    inline_keyboard: [
      [{ text: "🛍️ Lihat katalog", callback_data: "catalog" }],
      [{ text: "📦 Order saya", callback_data: "orders" }],
      [{ text: "🏠 Menu utama", callback_data: "menu" }],
    ],
  };
}

export function reengagementDeliveryBlockReason(input: {
  enabled: boolean;
  messageText: string | null;
}) {
  if (!input.messageText) return "Re-engagement notification has no message text";
  if (!input.enabled) return "Re-engagement dinonaktifkan sebelum pengiriman";
  return null;
}

async function processReengagement(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const settings = await getReengagementSettings();
  const blockReason = reengagementDeliveryBlockReason({
    enabled: settings.enabled,
    messageText: notification.messageText,
  });
  if (blockReason) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: blockReason,
      },
    });
    return "failed" as const;
  }

  return sendTextNotification(
    notification,
    notification.messageText!,
    reengagementReplyMarkup(),
  );
}

async function processOrderDeliveryFollowup(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const gate = await customerFollowupGate(notification);
  if (gate.outcome !== "ready") return gate.outcome;

  await prisma.$transaction(async (tx) => {
    await lockOrderPaymentTransition(tx, gate.order.id);
    await queueCompletedOrderFollowups({ tx, order: gate.order });
    await tx.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        leaseUntil: null,
        lastError: null,
      },
    });
  });
  return "sent" as const;
}

type CompletedOrderFollowup = {
  id: string;
  chatId: string;
  invoiceNumber: string;
  items: Array<{
    productId: string;
    productNameSnapshot: string;
  }>;
};

/**
 * Queue dependent customer notifications as soon as the final credential
 * commit succeeds.  The ORDER_DELIVERY_FOLLOWUP row remains a reconciliation
 * fallback for a worker crash between the delivery commit and this eager
 * fan-out, while stable dedupe keys make either path safe to run twice.
 */
async function eagerlyQueueCompletedOrderFollowups(order: CompletedOrderFollowup) {
  try {
    await prisma.$transaction(async (tx) => {
      await queueCompletedOrderFollowups({ tx, order });
    });
  } catch (error) {
    // The already-queued reconciliation row will retry the fan-out. Do not
    // turn an accepted credential upload into a second delivery attempt.
    console.warn("[Telegram post-delivery queue]", cleanError(error));
  }
}

async function processProductAttachment(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  if (!notification.orderId || !notification.productId) {
    throw new Error("Product attachment notification is incomplete");
  }
  const gate = await customerFollowupGate(notification);
  if (gate.outcome !== "ready") return gate.outcome;
  const order = gate.order;
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: notification.productId },
    select: {
      name: true,
      attachmentOriginalFilename: true,
      attachmentEncryptedPayload: true,
      attachmentEncryptionIv: true,
      attachmentEncryptionTag: true,
    },
  });
  if (
    !product.attachmentOriginalFilename ||
    !product.attachmentEncryptedPayload ||
    !product.attachmentEncryptionIv ||
    !product.attachmentEncryptionTag
  ) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null },
    });
    return "sent" as const;
  }

  const attachmentCaption =
    `Panduan tambahan ${product.name} untuk invoice ${order.invoiceNumber}. File produk utama ada pada pesan dokumen sebelumnya.`;
  try {
    await sendDocument({
      chatId: notification.chatId,
      filename: product.attachmentOriginalFilename,
      fileContent: decryptProductAttachment({
        attachmentEncryptedPayload: product.attachmentEncryptedPayload,
        attachmentEncryptionIv: product.attachmentEncryptionIv,
        attachmentEncryptionTag: product.attachmentEncryptionTag,
      }),
      caption: attachmentCaption,
    });
  } catch (error) {
    const errorMessage = cleanError(error);
    const ambiguous = digitalDeliveryOutcomeAmbiguous(error);
    const shouldRetry =
      !ambiguous && telegramErrorCanRetry(error) && notification.attempts < MAX_ATTEMPTS;
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: ambiguous ? "MANUAL_REVIEW" : shouldRetry ? "PENDING" : "FAILED",
        nextAttemptAt: nextAttempt(
          notification.attempts,
          error instanceof TelegramApiError ? error.retryAfterSeconds : undefined,
        ),
        leaseUntil: null,
        lastError: errorMessage,
      },
    });
    return ambiguous ? "manual_review" as const : shouldRetry ? "retry" as const : "failed" as const;
  }

  try {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), leaseUntil: null, lastError: null },
    });
    return "sent" as const;
  } catch {
    await prisma.telegramNotification.updateMany({
      where: { id: notification.id },
      data: {
        status: "MANUAL_REVIEW",
        leaseUntil: null,
        lastError: "Telegram accepted product attachment but final commit failed",
      },
    });
    return "manual_review" as const;
  }
}

export async function processProductPostDelivery(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const snapshot = parseProductPostDeliverySnapshot(notification.messageText);
  if (!notification.orderId || !notification.productId || !snapshot) {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        leaseUntil: null,
        lastError: "Product post-delivery notification snapshot is invalid",
      },
    });
    return "failed" as const;
  }

  const gate = await customerFollowupGate(notification);
  if (gate.outcome !== "ready") return gate.outcome;

  const attachments = await prisma.telegramNotification.findMany({
    where: {
      orderId: notification.orderId,
      kind: "PRODUCT_ATTACHMENT",
    },
    select: { status: true },
  });
  const attachmentState = productGuideAttachmentPrerequisiteState(
    attachments.map((item) => item.status),
  );
  if (attachmentState === "WAITING") {
    await requeueWaitingNotification(
      notification,
      "Post-delivery guide is waiting for the product attachment",
    );
    return "retry" as const;
  }
  if (attachmentState === "BLOCKED") {
    await markSensitiveNotificationBlocked(
      notification,
      "Post-delivery guide blocked because a product attachment was not delivered",
    );
    return "manual_review" as const;
  }

  const locale = await telegramLocaleForChat(notification.chatId);
  const documentInput = {
    snapshot,
    quantity: gate.order.items.filter((item) => item.productId === notification.productId).length,
    grandTotal: gate.order.grandTotal,
    locale,
  };
  let presentation = completedProductDeliveryDocument(documentInput);
  const longGuide = presentation.text.length > 1024;
  if (longGuide) presentation = completedProductDeliveryDocument({ ...documentInput, includeGuide: false });
  const replyMarkup = completedProductDeliveryReplyMarkup({ snapshot, orderId: gate.order.id, locale });
  if (longGuide) replyMarkup.inline_keyboard.unshift([{
    text: locale === "en" ? "Read full instructions" : "Baca panduan lengkap",
    callback_data: "delivery_guide:" + notification.id,
  }]);
  const receipt = await prisma.sentDelivery.findFirst({
    where: {
      orderId: gate.order.id, chatId: notification.chatId, channel: "TELEGRAM", status: "SENT",
      stockItemId: { in: gate.order.items.filter((item) => item.productId === notification.productId)
        .flatMap((item) => item.stockItemId ? [item.stockItemId] : []) },
      telegramMessageId: { not: null },
    },
    orderBy: { sentAt: "desc" },
    select: { telegramMessageId: true },
  });
  const messageId = Number(receipt?.telegramMessageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || presentation.text.length > 1024) {
    await markSensitiveNotificationBlocked(notification, "Completion caption requires an acknowledged product document and a valid caption");
    return "manual_review" as const;
  }
  return sendNotification(notification, () => editCompletionCaption({
    chatId: notification.chatId, messageId,
    caption: presentation.text, captionEntities: presentation.entities, replyMarkup,
  }));
}

export async function processSuccessChannel(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  let message: string | null = null;
  let webOrder = false;
  let websiteUrl: string | undefined;
  if (notification.orderId) {
    const prerequisites = await prisma.telegramNotification.findMany({
      where: {
        orderId: notification.orderId,
        kind: { in: ["PRODUCT_ATTACHMENT", PRODUCT_POST_DELIVERY_KIND] },
      },
      select: { status: true },
    });
    const prerequisiteState = successChannelPrerequisiteState(
      prerequisites.map((item) => item.status),
    );
    if (prerequisiteState === "WAITING") {
      await prisma.telegramNotification.update({
        where: { id: notification.id },
        data: {
          status: "PENDING",
          attempts: { decrement: 1 },
          nextAttemptAt: new Date(Date.now() + 5_000),
          leaseUntil: null,
          lastError: null,
        },
      });
      return "retry" as const;
    }
    if (prerequisiteState === "BLOCKED") {
      await prisma.telegramNotification.update({
        where: { id: notification.id },
        data: {
          status: "MANUAL_REVIEW",
          leaseUntil: null,
          lastError: "Success channel menunggu panduan pelanggan yang gagal dikirim",
        },
      });
      return "manual_review" as const;
    }

    const order = await prisma.order.findUnique({
      where: { id: notification.orderId },
      select: {
        channel: true,
        status: true,
        paymentStatus: true,
        webCustomerId: true,
        payment: { select: { status: true } },
        deliveryReceipts: { select: { stockItemId: true, channel: true, status: true } },
        buyerUsername: true,
        buyerDisplayName: true,
        grandTotal: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: { productNameSnapshot: true, stockItemId: true },
        },
      },
    });
    if (!order) {
      await markSensitiveNotificationBlocked(
        notification,
        "Success channel order no longer exists",
      );
      return "manual_review" as const;
    }
    webOrder = order.channel === "WEB";
    if (webOrder) {
      if (!completedWebOrderCanAnnounce(order)) {
        await markSensitiveNotificationBlocked(notification, "Web success announcement requires paid, completed delivery for every unit");
        return "manual_review" as const;
      }
      try { websiteUrl = storefrontPublicUrl(); } catch {
        await markSensitiveNotificationBlocked(notification, "Public storefront URL is invalid");
        return "manual_review" as const;
      }
    }
    message = digitalPurchaseSuccessMessage({
      channel: webOrder ? "WEB" : "TELEGRAM",
      websiteUrl,
      buyer: order.buyerUsername || order.buyerDisplayName,
      productNames: [...new Set(order.items.map((item) => item.productNameSnapshot))],
      total: order.grandTotal,
      quantity: order.items.length,
    });
  } else {
    const smsOrderId = successChannelSmsOrderId(notification.dedupeKey);
    if (smsOrderId) {
      const order = await prisma.smsPoolCustomerOrder.findUnique({
        where: { id: smsOrderId },
        select: {
          buyerUsername: true,
          buyerDisplayName: true,
          serviceName: true,
          countryName: true,
          sellPrice: true,
        },
      });
      if (order) {
        message = smsPurchaseSuccessMessage({
          buyer: order.buyerUsername || order.buyerDisplayName,
          serviceName: order.serviceName,
          countryName: order.countryName,
          total: order.sellPrice,
        });
      }
    }
  }

  if (!message) {
    await markSensitiveNotificationBlocked(
      notification,
      "Unknown success channel notification was blocked",
    );
    return "manual_review" as const;
  }

  if (webOrder) {
    const attempt = await prisma.telegramNotification.updateMany({
      where: { id: notification.id, kind: "SUCCESS_CHANNEL", status: "PROCESSING", messageText: null },
      data: { messageText: WEB_SUCCESS_DISPATCH_MARKER },
    });
    if (attempt.count !== 1) {
      await markSensitiveNotificationBlocked(notification, "Web success announcement may already have been dispatched; check the channel before retrying");
      return "manual_review" as const;
    }
  }
  const outcome = await sendTextNotification(
    notification,
    message,
    { inline_keyboard: [[webOrder
      ? { text: "🛍 Belanja di website BWR Tele", url: websiteUrl! }
      : { text: "🛍 Lihat katalog BWR Tele", url: telegramStoreBotUrl() },
    ]] },
    undefined,
    undefined,
    webOrder,
  );
  if (webOrder && outcome === "retry") {
    await prisma.telegramNotification.updateMany({
      where: { id: notification.id, status: "PENDING", messageText: WEB_SUCCESS_DISPATCH_MARKER },
      data: { messageText: null },
    });
  }
  return outcome;
}

async function processMainMenu(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const [locale, account] = await Promise.all([
    telegramLocaleForChat(notification.chatId),
    loadTelegramAccountSummary(notification.chatId),
  ]);
  const menu = mainMenuContent(
    notification.messageText ?? undefined,
    locale,
    account,
  );
  let sent: { message_id: number };
  try {
    sent = await sendMessage(notification.chatId, menu.text, menu.replyMarkup);
  } catch (error) {
    const errorMessage = cleanError(error);
    const ambiguous = error instanceof TelegramApiError && !error.responseReceived;
    const shouldRetry =
      !ambiguous && telegramErrorCanRetry(error) && notification.attempts < MAX_ATTEMPTS;
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: ambiguous ? "MANUAL_REVIEW" : shouldRetry ? "PENDING" : "FAILED",
        nextAttemptAt: nextAttempt(
          notification.attempts,
          error instanceof TelegramApiError ? error.retryAfterSeconds : undefined,
        ),
        leaseUntil: null,
        lastError: errorMessage,
      },
    });
    return ambiguous
      ? ("manual_review" as const)
      : shouldRetry
        ? ("retry" as const)
        : ("failed" as const);
  }

  try {
    await prisma.$transaction([
      prisma.botSession.upsert({
        where: { chatId: notification.chatId },
        create: {
          chatId: notification.chatId,
          navigationMessageId: sent.message_id,
        },
        update: { navigationMessageId: sent.message_id },
      }),
      prisma.telegramNotification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          leaseUntil: null,
          lastError: null,
        },
      }),
    ]);
  } catch (error) {
    await prisma.telegramNotification.updateMany({
      where: { id: notification.id },
      data: {
        status: "MANUAL_REVIEW",
        leaseUntil: null,
        lastError: `Menu terkirim tetapi penyimpanan posisi gagal: ${cleanError(error)}`.slice(0, 500),
      },
    });
    return "manual_review" as const;
  }

  // Keep earlier navigation bubbles as readable chat history.
  return "sent" as const;
}

async function processSingleDelivery(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const reservation = await reserveDeliveryReceipt(notification);
  if (reservation.blockedReason) {
    await markDigitalDeliveryBlocked([notification.id], reservation.blockedReason);
    return "failed" as const;
  }
  if (!reservation.receipt) {
    throw new Error("Digital delivery receipt was not reserved");
  }
  const receipt = reservation.receipt;
  if (receipt.status === "SENT") {
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: receipt.sentAt, leaseUntil: null },
    });
    return "sent" as const;
  }
  if (!reservation.canSend) {
    if (receipt.status === "SENDING") {
      await prisma.sentDelivery.update({
        where: { id: receipt.id },
        data: {
          status: "UNKNOWN",
          lastError: "A previous Telegram upload ended without a confirmed response",
        },
      });
    }
    await prisma.telegramNotification.update({
      where: { id: notification.id },
      data: {
        status: "MANUAL_REVIEW",
        leaseUntil: null,
        lastError: "Delivery outcome is ambiguous; automatic retry was blocked",
      },
    });
    return "manual_review" as const;
  }

  const stock = await prisma.digitalStockItem.findUniqueOrThrow({
    where: { id: notification.stockItemId! },
  });
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: notification.orderId! },
    include: { payment: true, items: { orderBy: { createdAt: "asc" } } },
  });
  const unitIndex = order.items.findIndex(
    (item) => item.stockItemId === notification.stockItemId,
  );
  const unitNumber = unitIndex >= 0 ? unitIndex + 1 : 1;
  const productName = order.items[unitIndex]?.productNameSnapshot ?? "Produk digital";
  const locale = await telegramLocaleForChat(notification.chatId);
  // Credential delivery is intentionally plain-captioned. Cosmetic entities
  // must never become a reason to reject or refund the actual document.
  const deliveryCaption = digitalDeliveryCaption({
    productName,
    invoiceNumber: order.invoiceNumber,
    unitNumber,
    totalUnits: order.items.length,
    locale,
  });

  let telegramMessage: { message_id: number };
  try {
    telegramMessage = await deliverInvoiceDocument({
      chatId: notification.chatId,
      invoiceMessageId: order.items.length === 1 ? await invoiceMessageIdForDelivery(order) : null,
      filename: stock.originalFilename,
      fileContent: decryptStockFile(stock),
      caption: deliveryCaption,
    });
  } catch (error) {
    const message = cleanError(error);
    const ambiguous = digitalDeliveryOutcomeAmbiguous(error);
    if (ambiguous) {
      await prisma.$transaction([
        prisma.sentDelivery.update({
          where: { id: receipt.id },
          data: { status: "UNKNOWN", lastError: message },
        }),
        prisma.telegramNotification.update({
          where: { id: notification.id },
          data: { status: "MANUAL_REVIEW", leaseUntil: null, lastError: message },
        }),
      ]);
      return "manual_review" as const;
    }

    const formatFailure = isTelegramEntityFormatError(error);
    const shouldRetry = !formatFailure && telegramErrorCanRetry(error) && notification.attempts < MAX_ATTEMPTS;
    await prisma.$transaction([
      prisma.sentDelivery.update({
        where: { id: receipt.id },
        data: { status: "FAILED", lastError: message },
      }),
      prisma.telegramNotification.update({
        where: { id: notification.id },
        data: {
          // A Telegram entity bug is a code/configuration problem, not proof
          // that the reserved credential failed. Keep it retryable by admin
          // and never trigger an automatic wallet refund.
          status: formatFailure ? "FAILED" : shouldRetry ? "PENDING" : "FAILED",
          nextAttemptAt: nextAttempt(
            notification.attempts,
            error instanceof TelegramApiError ? error.retryAfterSeconds : undefined,
          ),
          leaseUntil: null,
          lastError: message,
        },
      }),
    ]);
    if (!shouldRetry && digitalDeliveryFailureAllowsAutomaticRefund(error)) {
      try {
        await refundFailedDeliveryToWallet({
          orderId: notification.orderId!,
          notificationId: notification.id,
          reason: message,
        });
      } catch (refundError) {
        await prisma.telegramNotification.update({
          where: { id: notification.id },
          data: {
            status: "MANUAL_REVIEW",
            lastError: `${message}; refund gagal: ${cleanError(refundError)}`.slice(0, 500),
          },
        });
        return "manual_review" as const;
      }
    }
    return shouldRetry ? ("retry" as const) : ("failed" as const);
  }

  const now = new Date();
  let orderCompleted = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.sentDelivery.update({
        where: { id: receipt.id },
        data: {
          status: "SENT",
          telegramMessageId: String(telegramMessage.message_id),
          sentAt: now,
          lastError: null,
        },
      });
      await tx.digitalStockItem.update({
        where: { id: stock.id },
        data: deliveredStockState(order.id, now),
      });
      await tx.telegramNotification.update({
        where: { id: notification.id },
        data: { status: "SENT", sentAt: now, leaseUntil: null, lastError: null },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: order.id },
        select: { stockItem: { select: { status: true } } },
      });
      const allDelivered = allOrderUnitsDelivered(
        items.map((item) => item.stockItem?.status),
      );
      if (allDelivered) {
        await tx.order.update({
          where: { id: order.id },
          data: { status: "COMPLETED", completedAt: now },
        });
        await queueOrderDeliveryFollowup({
          tx,
          orderId: order.id,
          chatId: order.chatId,
        });
        orderCompleted = true;
      }
    });
    if (orderCompleted) {
      await eagerlyQueueCompletedOrderFollowups(order);
    }
    return "sent" as const;
  } catch (error) {
    const message = `Telegram accepted the file, but final database commit failed: ${cleanError(error)}`;
    try {
      await prisma.$transaction([
        prisma.sentDelivery.update({
          where: { id: receipt.id },
          data: { status: "UNKNOWN", lastError: message },
        }),
        prisma.telegramNotification.update({
          where: { id: notification.id },
          data: { status: "MANUAL_REVIEW", leaseUntil: null, lastError: message },
        }),
      ]);
    } catch {
      // The existing SENDING receipt still blocks an automatic resend after its lease expires.
    }
    return "manual_review" as const;
  }
}

type ClaimedNotification = NonNullable<
  Awaited<ReturnType<typeof claimNextNotification>>
>;

type GroupDeliveryCandidate = {
  notification: ClaimedNotification;
  stock: Prisma.DigitalStockItemGetPayload<Record<string, never>>;
  fileContent: Buffer;
  credential: CredentialJson | null;
  textContent: string | null;
  unitNumber: number;
  productName: string;
};

type GroupDeliveryUnit = GroupDeliveryCandidate & {
  receipt: Prisma.SentDeliveryGetPayload<Record<string, never>>;
};

function k12Credential(fileContent: Buffer): CredentialJson | null {
  const parsed = detectStockContent(fileContent.toString("utf8"));
  return parsed.kind === "K12" ? parsed.credential : null;
}

async function settleRemainingOrderDeliveryNotifications(input: {
  orderId: string;
  excludeNotificationIds: string[];
  result: "retry" | "failed" | "manual_review";
  reason: string;
  retryAt?: Date;
}) {
  if (input.result === "retry") {
    const retryAt = input.retryAt ?? new Date(Date.now() + 5_000);
    await prisma.$transaction([
      prisma.telegramNotification.updateMany({
        where: {
          orderId: input.orderId,
          kind: "DIGITAL_FILE",
          id: { notIn: input.excludeNotificationIds },
          status: "PROCESSING",
        },
        data: {
          status: "PENDING",
          attempts: { decrement: 1 },
          nextAttemptAt: retryAt,
          leaseUntil: null,
          lastError: input.reason,
        },
      }),
      prisma.telegramNotification.updateMany({
        where: {
          orderId: input.orderId,
          kind: "DIGITAL_FILE",
          id: { notIn: input.excludeNotificationIds },
          status: "PENDING",
        },
        data: { nextAttemptAt: retryAt, lastError: input.reason },
      }),
    ]);
    return;
  }

  await prisma.telegramNotification.updateMany({
    where: {
      orderId: input.orderId,
      kind: "DIGITAL_FILE",
      id: { notIn: input.excludeNotificationIds },
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: input.result === "manual_review" ? "MANUAL_REVIEW" : "FAILED",
      leaseUntil: null,
      lastError: input.reason,
    },
  });
}

async function markGroupedDeliveryFailure(
  units: GroupDeliveryUnit[],
  error: unknown,
) {
  const message = cleanError(error);
  const receiptIds = units.map((unit) => unit.receipt.id);
  const notificationIds = units.map((unit) => unit.notification.id);
  const ambiguous = digitalDeliveryOutcomeAmbiguous(error);
  if (ambiguous) {
    await prisma.$transaction([
      prisma.sentDelivery.updateMany({
        where: { id: { in: receiptIds } },
        data: { status: "UNKNOWN", lastError: message },
      }),
      prisma.telegramNotification.updateMany({
        where: { id: { in: notificationIds } },
        data: { status: "MANUAL_REVIEW", leaseUntil: null, lastError: message },
      }),
    ]);
    return { status: "manual_review" as const, retryAt: null };
  }

  const attempts = Math.max(...units.map((unit) => unit.notification.attempts));
  const formatFailure = isTelegramEntityFormatError(error);
  const shouldRetry = !formatFailure && telegramErrorCanRetry(error) && attempts < MAX_ATTEMPTS;
  const retryAt = nextAttempt(
    attempts,
    error instanceof TelegramApiError ? error.retryAfterSeconds : undefined,
  );
  await prisma.$transaction([
    prisma.sentDelivery.updateMany({
      where: { id: { in: receiptIds } },
      data: { status: "FAILED", lastError: message },
    }),
    prisma.telegramNotification.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        nextAttemptAt: retryAt,
        leaseUntil: null,
        lastError: message,
      },
    }),
  ]);
  if (shouldRetry) return { status: "retry" as const, retryAt };
  if (!digitalDeliveryFailureAllowsAutomaticRefund(error)) {
    return { status: "failed" as const, retryAt: null };
  }

  try {
    await refundFailedDeliveryToWallet({
      orderId: units[0].notification.orderId!,
      notificationId: units[0].notification.id,
      reason: message,
    });
    return { status: "failed" as const, retryAt: null };
  } catch (refundError) {
    await prisma.telegramNotification.updateMany({
      where: { id: { in: notificationIds } },
      data: {
        status: "MANUAL_REVIEW",
        lastError: `${message}; refund gagal: ${cleanError(refundError)}`.slice(0, 500),
      },
    });
    return { status: "manual_review" as const, retryAt: null };
  }
}

async function finalizeGroupedDelivery(input: {
  units: GroupDeliveryUnit[];
  order: Awaited<ReturnType<typeof loadGroupedDeliveryOrder>>;
  telegramMessageId: number;
}) {
  const now = new Date();
  let orderCompleted = false;

  await prisma.$transaction(async (tx) => {
    await tx.sentDelivery.updateMany({
      where: { id: { in: input.units.map((unit) => unit.receipt.id) } },
      data: {
        status: "SENT",
        telegramMessageId: String(input.telegramMessageId),
        sentAt: now,
        lastError: null,
      },
    });
    await tx.digitalStockItem.updateMany({
      where: { id: { in: input.units.map((unit) => unit.stock.id) } },
      data: deliveredStockState(input.order.id, now),
    });
    await tx.telegramNotification.updateMany({
      where: { id: { in: input.units.map((unit) => unit.notification.id) } },
      data: { status: "SENT", sentAt: now, leaseUntil: null, lastError: null },
    });

    const items = await tx.orderItem.findMany({
      where: { orderId: input.order.id },
      select: { stockItem: { select: { status: true } } },
    });
    if (!allOrderUnitsDelivered(items.map((item) => item.stockItem?.status))) {
      return;
    }

    await tx.order.update({
      where: { id: input.order.id },
      data: { status: "COMPLETED", completedAt: now },
    });
    await queueOrderDeliveryFollowup({
      tx,
      orderId: input.order.id,
      chatId: input.order.chatId,
    });
    orderCompleted = true;
  });

  if (orderCompleted) {
    await eagerlyQueueCompletedOrderFollowups(input.order);
  }
}

async function loadGroupedDeliveryOrder(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { payment: true, items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
  });
}

async function processDelivery(notification: ClaimedNotification) {
  const claimedRows = await prisma.telegramNotification.findMany({
    where: { id: { in: notification.deliveryNotificationIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const claimedNotifications = claimedRows.map((row) => ({
    ...row,
    deliveryNotificationIds: notification.deliveryNotificationIds,
  }));

  if (!notification.orderId) {
    await markSensitiveNotificationsBlocked(
      claimedNotifications,
      "Digital delivery notification has no order",
    );
    return "manual_review" as const;
  }
  const order = await loadGroupedDeliveryOrder(notification.orderId);
  const recipientMismatch =
    !isPrivateTelegramChatId(order.chatId) ||
    order.chatId !== notification.chatId ||
    claimedNotifications.some(
      (claimed) =>
        claimed.chatId !== order.chatId || claimed.orderId !== notification.orderId,
    );
  if (recipientMismatch) {
    await markSensitiveNotificationsBlocked(
      claimedNotifications,
      "Digital delivery recipient does not match the private order owner",
    );
    return "manual_review" as const;
  }

  const unitByStockId = new Map(
    order.items.flatMap((item, index) =>
      item.stockItemId
        ? [[item.stockItemId, {
            unitNumber: index + 1,
            productName: item.productNameSnapshot,
          }] as const]
        : [],
    ),
  );
  const candidates: GroupDeliveryCandidate[] = [];
  let invalidCandidate = false;
  for (const claimed of claimedNotifications) {
    if (!claimed.stockItemId) {
      invalidCandidate = true;
      await markSensitiveNotificationBlocked(
        claimed,
        "Digital delivery notification has no stock item",
      );
      continue;
    }
    const orderUnit = unitByStockId.get(claimed.stockItemId);
    if (!orderUnit) {
      invalidCandidate = true;
      await markSensitiveNotificationBlocked(
        claimed,
        "Digital delivery stock does not belong to the owning order",
      );
      continue;
    }
    const stock = await prisma.digitalStockItem.findUniqueOrThrow({
      where: { id: claimed.stockItemId },
    });
    const fileContent = decryptStockFile(stock);
    const credential = k12Credential(fileContent);
    const textContent = credential
      ? null
      : plainTextStockContent(stock.originalFilename, fileContent);
    candidates.push({
      notification: claimed,
      stock,
      fileContent,
      credential,
      textContent,
      unitNumber: orderUnit.unitNumber,
      productName: orderUnit.productName,
    });
  }
  candidates.sort((left, right) => left.unitNumber - right.unitNumber);

  if (candidates.length === 0) {
    return invalidCandidate ? ("manual_review" as const) : ("sent" as const);
  }
  if (candidates.length === 1) {
    const status = await processSingleDelivery(candidates[0].notification);
    return invalidCandidate && status === "sent" ? ("manual_review" as const) : status;
  }

  const groupMode = deliveryBundleFormatFor(candidates);
  const chunks = buildBoundedDeliveryChunks(
    candidates,
    (items) => buildDeliveryBundleContent(
      groupMode,
      items.map((item) => ({
        filename: item.stock.originalFilename,
        fileContent: item.fileContent,
        credential: item.credential,
        textContent: item.textContent,
      })),
    ),
  );

  const locale = await telegramLocaleForChat(order.chatId);
  let result: "sent" | "failed" | "manual_review" = invalidCandidate
    ? "manual_review"
    : "sent";

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    const units: GroupDeliveryUnit[] = [];
    let ambiguousBlocked = false;
    let nonDeliverableBlocked = false;
    for (const candidate of chunk.items) {
      const reservation = await reserveDeliveryReceipt(candidate.notification);
      if (reservation.blockedReason) {
        nonDeliverableBlocked = true;
        await markDigitalDeliveryBlocked(
          [candidate.notification.id],
          reservation.blockedReason,
        );
        continue;
      }
      if (!reservation.receipt) {
        throw new Error("Digital delivery receipt was not reserved");
      }
      if (!reservation.canSend) {
        if (reservation.receipt.status === "SENT") {
          await prisma.telegramNotification.update({
            where: { id: candidate.notification.id },
            data: {
              status: "SENT",
              sentAt: reservation.receipt.sentAt,
              leaseUntil: null,
            },
          });
        } else {
          ambiguousBlocked = true;
          if (reservation.receipt.status === "SENDING") {
            await prisma.sentDelivery.update({
              where: { id: reservation.receipt.id },
              data: {
                status: "UNKNOWN",
                lastError: "A previous Telegram upload ended without a confirmed response",
              },
            });
          }
          await prisma.telegramNotification.update({
            where: { id: candidate.notification.id },
            data: {
              status: "MANUAL_REVIEW",
              leaseUntil: null,
              lastError: "Delivery outcome is ambiguous; automatic retry was blocked",
            },
          });
        }
        continue;
      }
      units.push({ ...candidate, receipt: reservation.receipt });
    }

    if (ambiguousBlocked) result = "manual_review";
    else if (nonDeliverableBlocked && result === "sent") result = "failed";
    if (units.length === 0) continue;
    const unitStart = Math.min(...units.map((unit) => unit.unitNumber));
    const unitEnd = Math.max(...units.map((unit) => unit.unitNumber));
    const groupedFilename = deliveryBundleFilename({
      invoiceNumber: order.invoiceNumber,
      format: groupMode,
      quantity: units.length,
      unitStart,
      unitEnd,
      totalUnits: order.items.length,
    });
    const groupedContent = units.length === chunk.items.length
      ? chunk.content
      : buildDeliveryBundleContent(
          groupMode,
          units.map((unit) => ({
            filename: unit.stock.originalFilename,
            fileContent: unit.fileContent,
            credential: unit.credential,
            textContent: unit.textContent,
          })),
        );
    const groupedCaption = groupedDeliveryCaption({
      productNames: units.map((unit) => unit.productName),
      invoiceNumber: order.invoiceNumber,
      quantity: units.length,
      format: groupMode,
      locale,
      unitStart,
      unitEnd,
      totalUnits: order.items.length,
    });
    let telegramMessage: { message_id: number };
    try {
    telegramMessage = await deliverInvoiceDocument({
      chatId: order.chatId,
      invoiceMessageId: chunks.length === 1 && units.length === order.items.length ? await invoiceMessageIdForDelivery(order) : null,
      filename: groupedFilename,
      fileContent: groupedContent,
      caption: groupedCaption,
    });
    } catch (error) {
      const failure = await markGroupedDeliveryFailure(units, error);
      await settleRemainingOrderDeliveryNotifications({
        orderId: order.id,
        excludeNotificationIds: units.map((unit) => unit.notification.id),
        result: failure.status,
        retryAt: failure.retryAt ?? undefined,
        reason: "Waiting for the earlier delivery batch to finish safely",
      });
      return failure.status;
    }

    try {
      await finalizeGroupedDelivery({
        units,
        order,
        telegramMessageId: telegramMessage.message_id,
      });
    } catch (error) {
      const message = `Telegram accepted the grouped file, but final database commit failed: ${cleanError(error)}`;
      try {
        await prisma.$transaction([
          prisma.sentDelivery.updateMany({
            where: { id: { in: units.map((unit) => unit.receipt.id) } },
            data: { status: "UNKNOWN", lastError: message },
          }),
          prisma.telegramNotification.updateMany({
            where: { id: { in: units.map((unit) => unit.notification.id) } },
            data: { status: "MANUAL_REVIEW", leaseUntil: null, lastError: message },
          }),
        ]);
      } catch {
        // SENDING receipts still block an automatic resend after lease expiry.
      }
      await settleRemainingOrderDeliveryNotifications({
        orderId: order.id,
        excludeNotificationIds: units.map((unit) => unit.notification.id),
        result: "manual_review",
        reason: "A previous delivery batch has an unknown final commit outcome",
      });
      return "manual_review" as const;
    }
  }

  return result;
}

async function processNotification(
  notification: NonNullable<Awaited<ReturnType<typeof claimNextNotification>>>,
) {
  const privateChatBlockReason = telegramNotificationPrivateChatBlockReason({
    kind: notification.kind,
    chatId: notification.chatId,
  });
  if (privateChatBlockReason) {
    await markSensitiveNotificationsBlocked(
      notification.deliveryNotificationIds.length > 0
        ? notification.deliveryNotificationIds.map((id) => ({ id }))
        : [notification],
      privateChatBlockReason,
    );
    return "manual_review" as const;
  }
  if (notification.kind === "PAYMENT_SUCCESS") {
    return processPaymentSuccess(notification);
  }
  if (notification.kind === "PRODUCT_ANNOUNCEMENT") {
    return processProductAnnouncement(notification);
  }
  if (notification.kind === "PRODUCT_RESTOCK") {
    return processProductRestock(notification);
  }
  if (notification.kind === "PRODUCT_SOLD_OUT") {
    return processProductSoldOut(notification);
  }
  if (notification.kind === "WALLET_TOPUP_SUCCESS") {
    return processWalletTopupSuccess(notification);
  }
  if (notification.kind === "WALLET_REFUND") {
    return processWalletRefund(notification);
  }
  if (notification.kind === "PREORDER_CANCELLED") {
    return processPreorderCancellation(notification);
  }
  if (notification.kind === "ADMIN_MESSAGE") {
    return processAdminMessage(notification);
  }
  if (notification.kind === "SYSTEM_ALERT") {
    return processSystemAlert(notification);
  }
  if (notification.kind === "SMS_OTP_SUCCESS") {
    return processSmsOtpSuccess(notification);
  }
  if (notification.kind === "WALLET_ADJUSTMENT") {
    return processWalletAdjustment(notification);
  }
  if (notification.kind === "REFERRAL_REWARD") {
    return processReferralReward(notification);
  }
  if (notification.kind === "ADMIN_BROADCAST") {
    return processAdminBroadcast(notification);
  }
  if (notification.kind === "REENGAGEMENT") {
    return processReengagement(notification);
  }
  if (notification.kind === ORDER_DELIVERY_FOLLOWUP_KIND) {
    return processOrderDeliveryFollowup(notification);
  }
  if (notification.kind === "SUCCESS_CHANNEL") {
    return processSuccessChannel(notification);
  }
  if (notification.kind === "PRODUCT_ATTACHMENT") {
    return processProductAttachment(notification);
  }
  if (notification.kind === PRODUCT_POST_DELIVERY_KIND) {
    return processProductPostDelivery(notification);
  }
  if (notification.kind === "MAIN_MENU") {
    return processMainMenu(notification);
  }
  if (notification.kind === "DIGITAL_FILE") {
    return processDelivery(notification);
  }
  await prisma.telegramNotification.update({
    where: { id: notification.id },
    data: {
      status: "FAILED",
      leaseUntil: null,
      lastError: `Unknown notification kind: ${notification.kind}`,
    },
  });
  return "failed" as const;
}

async function markUnhandledNotificationFailure(
  notification: ClaimedNotification,
  error: unknown,
) {
  const message = cleanError(error).slice(0, 500);
  const ambiguous = error instanceof TelegramApiError && !error.responseReceived;
  const status = unhandledNotificationState({
    attempts: notification.attempts,
    ambiguous,
    retryable: telegramErrorCanRetry(error),
  });
  const ids = notification.deliveryNotificationIds.length > 0
    ? notification.deliveryNotificationIds
    : [notification.id];
  await prisma.telegramNotification.updateMany({
    where: { id: { in: ids }, status: "PROCESSING" },
    data: {
      status,
      leaseUntil: null,
      ...(status === "PENDING"
        ? { nextAttemptAt: nextAttempt(notification.attempts) }
        : {}),
      lastError: message,
    },
  });

  return status === "MANUAL_REVIEW"
    ? ("manual_review" as const)
    : status === "PENDING"
      ? ("retry" as const)
      : ("failed" as const);
}

export async function processTelegramNotifications(batchSize = 25, concurrency = 3) {
  await quarantineExpiredPostDeliveryLeases();
  await requeueRecoverableDeliveryReceiptCollisions(batchSize);
  await requeueRecoverablePostDeliverySnapshots(batchSize);
  const result = { processed: 0, sent: 0, retry: 0, failed: 0, manualReview: 0 };
  const limit = Math.max(0, Math.trunc(batchSize));
  // Empty fast polls need one indexed existence check, not one advisory-lock
  // transaction per delivery slot. Recovery/quarantine still runs first, and
  // every actual claim is revalidated transactionally below.
  if (limit === 0 || !await prisma.telegramNotification.findFirst({
    where: notificationClaimWhere(new Date(), []),
    select: { id: true },
  })) return result;
  let claimsStarted = 0;

  async function runSlot() {
    while (claimsStarted < limit) {
      claimsStarted += 1;
      const notification = await claimNextNotification();
      if (!notification) return;
      result.processed += 1;
      let status: "sent" | "retry" | "failed" | "manual_review";
      try {
        status = await processNotification(notification);
      } catch (error) {
        // One bad notification must never abort the whole worker batch.  Clear
        // its lease and continue with other buyers immediately.
        status = await markUnhandledNotificationFailure(notification, error);
      }
      if (status === "sent") result.sent += 1;
      if (status === "retry") result.retry += 1;
      if (status === "failed") result.failed += 1;
      if (status === "manual_review") result.manualReview += 1;
    }
  }

  await Promise.all(
    Array.from({ length: notificationWorkerSlots(limit, concurrency) }, () => runSlot()),
  );
  return result;
}
