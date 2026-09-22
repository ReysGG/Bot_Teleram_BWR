import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  isPaymentEventWithinWindow,
  PAYMENT_EVENT_CLOCK_SKEW_MS,
} from "@/server/payment/window";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import {
  confirmWalletTopup,
} from "@/server/wallet/topup";
import { applyWalletTransaction } from "@/server/wallet/ledger";
import { walletTopupSuccessDedupeKey } from "@/server/telegram/delivery-key";
import { creditExpiredOrderPaymentToWalletTx } from "@/server/wallet/expired-order-credit";
import {
  androidPaymentProviderForPackage,
  type AndroidPaymentProvider,
  JAGO_TRANSFER_METHOD,
} from "@/server/payment/android-payment-provider";
import {
  DANA_WALLET_TOPUP_METHOD,
  orderPaymentMethodMatchesProvider,
  orderPaymentMethodsForProvider,
  walletTopupPaymentMethodForProvider,
} from "@/server/payment/provider-methods";
import { qrisInvoiceEventBlockReason } from "@/server/payment/qris-attempt-policy";

export { isPaymentEventWithinWindow } from "@/server/payment/window";

export type ReconciliationTargetKind = "order" | "wallet_topup";
export type ReconciliationPaymentProvider = AndroidPaymentProvider;

export function reconciliationPaymentProvider(event: {
  source: string;
  provider: string | null;
  packageName: string | null;
}): ReconciliationPaymentProvider | null {
  if (event.source === "RELAY") return "DANA";
  if (event.source !== "ANDROID" || !event.packageName) return null;
  const packageProvider = androidPaymentProviderForPackage(event.packageName);
  return packageProvider && event.provider === packageProvider
    ? packageProvider
    : null;
}

export class PaymentReconciliationError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.name = "PaymentReconciliationError";
    this.code = code;
  }
}

/** Keep admin audit notes useful without copying tokens, URLs, or provider payloads. */
export function sanitizeReconciliationReason(value: string): string {
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[LINK REMOVED]")
    .replace(/[A-Za-z0-9_-]{40,}/g, "[REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 500);
}

export function paymentEventDiagnostic(
  status: string,
  rawReason?: string | null,
) {
  if (status === "CONFIRMED") {
    return {
      label: "Terkonfirmasi",
      tone: "good" as const,
      detail: "Event sudah direkonsiliasi dan tidak perlu diproses ulang.",
      isProblem: false,
    };
  }
  const reason = rawReason?.toLowerCase() ?? "";
  if (reason.includes("ambiguous")) {
    return {
      label: "Nominal ganda",
      tone: "bad" as const,
      detail: "Nominal cocok dengan lebih dari satu transaksi. Pilih invoice secara manual.",
      isProblem: true,
    };
  }
  if (reason.includes("unmatched") || reason.includes("no active")) {
    return {
      label: "Belum cocok",
      tone: "warn" as const,
      detail: "Belum ada transaksi aktif yang dapat dipastikan cocok.",
      isProblem: true,
    };
  }
  if (reason.includes("expired") || reason.includes("window") || reason.includes("time")) {
    return {
      label: "Di luar waktu",
      tone: "warn" as const,
      detail: "Event datang di luar jendela pembayaran yang tercatat.",
      isProblem: true,
    };
  }
  if (reason.includes("amount") || reason.includes("rupiah")) {
    return {
      label: "Nominal tidak valid",
      tone: "bad" as const,
      detail: "Nominal event tidak dapat dicocokkan dengan aman.",
      isProblem: true,
    };
  }
  return {
    label: status === "RECEIVED" ? "Belum diproses" : "Perlu review",
    tone: "warn" as const,
    detail: "Event pembayaran memerlukan pemeriksaan admin.",
    isProblem: status !== "RECEIVED",
  };
}

export type PaymentReconciliationCandidate = {
  kind: ReconciliationTargetKind;
  id: string;
  invoiceNumber: string;
  chatId: string;
  buyerUsername: string | null;
  buyerDisplayName: string | null;
  amount: number;
  status: string;
  createdAt: Date;
  expiresAt: Date;
  late: boolean;
};

type EventWindow = {
  amount: number;
  postedAt: Date;
};

function eventWindow(event: EventWindow, target: { createdAt: Date; expiresAt: Date }) {
  if (!Number.isSafeInteger(event.amount) || event.amount <= 0) {
    throw new PaymentReconciliationError("amount_missing");
  }
  if (
    !isPaymentEventWithinWindow({
      postedAt: event.postedAt,
      createdAt: target.createdAt,
      expiresAt: target.expiresAt,
    })
  ) {
    throw new PaymentReconciliationError("outside_window");
  }
}

function lateTarget(input: {
  status: string;
  expiresAt: Date;
  now: Date;
}) {
  return input.status !== "PENDING" || input.expiresAt <= input.now;
}

export type OrderReconciliationState = "active" | "expired" | "unavailable";

export function orderReconciliationState(input: {
  orderStatus: string;
  orderPaymentStatus: string;
  paymentStatus: string;
  expiresAt: Date;
  now: Date;
}): OrderReconciliationState {
  if (
    input.orderStatus === "PENDING_PAYMENT" &&
    input.orderPaymentStatus === "PENDING" &&
    input.paymentStatus === "PENDING" &&
    input.expiresAt > input.now
  ) {
    return "active";
  }
  if (
    input.orderStatus === "EXPIRED" &&
    input.orderPaymentStatus === "EXPIRED" &&
    input.paymentStatus === "EXPIRED" &&
    input.expiresAt <= input.now
  ) {
    return "expired";
  }
  return "unavailable";
}

export async function findPaymentReconciliationCandidates(
  eventId: string,
): Promise<PaymentReconciliationCandidate[]> {
  const event = await prisma.bridgePaymentEvent.findUnique({
    where: { eventId },
    select: {
      eventId: true,
      amount: true,
      postedAt: true,
      source: true,
      provider: true,
      claimId: true,
      deviceId: true,
      packageName: true,
      status: true,
      orderId: true,
      walletTopupId: true,
    },
  });
  if (!event?.amount) return [];
  const provider = reconciliationPaymentProvider(event);
  if (!provider) return [];

  const createdAtLimit = new Date(event.postedAt.getTime() + PAYMENT_EVENT_CLOCK_SKEW_MS);
  const expiresAtLimit = new Date(event.postedAt.getTime() - PAYMENT_EVENT_CLOCK_SKEW_MS);
  const [payments, topups] = await Promise.all([
    prisma.payment.findMany({
      where: {
        billedAmount: event.amount,
        method: { in: [...orderPaymentMethodsForProvider(provider)] },
        createdAt: { lte: createdAtLimit },
        expiresAt: { gte: expiresAtLimit },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        orderId: true,
        billedAmount: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        order: {
          select: {
            invoiceNumber: true,
            chatId: true,
            buyerUsername: true,
            buyerDisplayName: true,
            status: true,
            paymentStatus: true,
            bridgeClaim: { select: { claimId: true } },
            qrisInvoiceAttempt: true,
          },
        },
      },
    }),
    prisma.walletTopup.findMany({
      where: {
        paymentMethod: walletTopupPaymentMethodForProvider(provider),
        billedAmount: event.amount,
        createdAt: { lte: createdAtLimit },
        expiresAt: { gte: expiresAtLimit },
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        invoiceNumber: true,
        chatId: true,
        baseAmount: true,
        billedAmount: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        wallet: { select: { buyerUsername: true, buyerDisplayName: true } },
        bridgeClaim: { select: { claimId: true } },
        qrisInvoiceAttempt: true,
      },
    }),
  ]);
  const now = new Date();
  const orderCandidates = payments.flatMap((payment) => {
    if (
      provider !== "JAGO" &&
      qrisInvoiceEventBlockReason({
        targetKind: "order",
        targetId: payment.orderId,
        billedAmount: payment.billedAmount,
        createdAt: payment.createdAt,
        expiresAt: payment.expiresAt,
        bridgeClaim: payment.order.bridgeClaim,
        attempt: payment.order.qrisInvoiceAttempt,
        event,
        allowRejectedEvent: true,
      })
    ) {
      return [];
    }
    if (
      !isPaymentEventWithinWindow({
        postedAt: event.postedAt,
        createdAt: payment.createdAt,
        expiresAt: payment.expiresAt,
      })
    ) {
      return [];
    }
    const state = orderReconciliationState({
      orderStatus: payment.order.status,
      orderPaymentStatus: payment.order.paymentStatus,
      paymentStatus: payment.status,
      expiresAt: payment.expiresAt,
      now,
    });
    if (state === "unavailable") return [];
    return [{
      kind: "order" as const,
      id: payment.orderId,
      invoiceNumber: payment.order.invoiceNumber,
      chatId: payment.order.chatId,
      buyerUsername: payment.order.buyerUsername,
      buyerDisplayName: payment.order.buyerDisplayName,
      amount: payment.billedAmount,
      status: payment.status,
      createdAt: payment.createdAt,
      expiresAt: payment.expiresAt,
      late: state === "expired",
    }];
  });
  const topupCandidates = topups
    .filter((topup) => topup.status !== "PAID")
    .filter(
      (topup) =>
        provider === "JAGO" ||
        !qrisInvoiceEventBlockReason({
          targetKind: "wallet_topup",
          targetId: topup.id,
          billedAmount: topup.billedAmount,
          createdAt: topup.createdAt,
          expiresAt: topup.expiresAt,
          bridgeClaim: topup.bridgeClaim,
          attempt: topup.qrisInvoiceAttempt,
          event,
          allowRejectedEvent: true,
        }),
    )
    .filter((topup) =>
      isPaymentEventWithinWindow({
        postedAt: event.postedAt,
        createdAt: topup.createdAt,
        expiresAt: topup.expiresAt,
      }),
    )
    .map((topup) => ({
      kind: "wallet_topup" as const,
      id: topup.id,
      invoiceNumber: topup.invoiceNumber,
      chatId: topup.chatId,
      buyerUsername: topup.wallet.buyerUsername,
      buyerDisplayName: topup.wallet.buyerDisplayName,
      amount: topup.billedAmount,
      status: topup.status,
      createdAt: topup.createdAt,
      expiresAt: topup.expiresAt,
      late: lateTarget({ status: topup.status, expiresAt: topup.expiresAt, now }),
    }));
  return [...orderCandidates, ...topupCandidates].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
  );
}

type ReserveResult = {
  eventId: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  late: boolean;
};

async function reserveEventTarget(input: {
  eventId: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  now: Date;
}): Promise<ReserveResult> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_reconcile_event_${input.eventId}`}))`;
    const event = await tx.bridgePaymentEvent.findUnique({ where: { eventId: input.eventId } });
    if (!event) throw new PaymentReconciliationError("event_not_found");
    if (event.status === "CONFIRMED") throw new PaymentReconciliationError("already_confirmed");
    if (event.status !== "REJECTED") throw new PaymentReconciliationError("event_not_ready");
    if (!event.amount) throw new PaymentReconciliationError("amount_missing");
    const provider = reconciliationPaymentProvider(event);
    if (!provider) throw new PaymentReconciliationError("provider_mismatch");
    if (event.orderId && (input.targetKind !== "order" || event.orderId !== input.targetId)) {
      throw new PaymentReconciliationError("target_conflict");
    }
    if (
      event.walletTopupId &&
      (input.targetKind !== "wallet_topup" || event.walletTopupId !== input.targetId)
    ) {
      throw new PaymentReconciliationError("target_conflict");
    }

    let late = false;
    if (input.targetKind === "order") {
      const payment = await tx.payment.findUnique({
        where: { orderId: input.targetId },
        include: {
          order: {
            include: { bridgeClaim: true, qrisInvoiceAttempt: true },
          },
        },
      });
      if (!payment || payment.status === "PAID" || payment.order.paymentStatus === "PAID") {
        throw new PaymentReconciliationError("target_unavailable");
      }
      if (
        !orderPaymentMethodMatchesProvider(provider, payment.method)
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      if (event.amount !== payment.billedAmount) {
        throw new PaymentReconciliationError("amount_mismatch");
      }
      if (
        provider !== "JAGO" &&
        qrisInvoiceEventBlockReason({
          targetKind: "order",
          targetId: payment.orderId,
          billedAmount: payment.billedAmount,
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt,
          bridgeClaim: payment.order.bridgeClaim,
          attempt: payment.order.qrisInvoiceAttempt,
          event,
          allowRejectedEvent: true,
        })
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      eventWindow({ amount: event.amount, postedAt: event.postedAt }, payment);
      const state = orderReconciliationState({
        orderStatus: payment.order.status,
        orderPaymentStatus: payment.order.paymentStatus,
        paymentStatus: payment.status,
        expiresAt: payment.expiresAt,
        now: input.now,
      });
      if (state === "unavailable") {
        throw new PaymentReconciliationError("target_unavailable");
      }
      late = state === "expired";
      await tx.bridgePaymentEvent.update({
        where: { eventId: input.eventId },
        data: { orderId: input.targetId, walletTopupId: null },
      });
    } else {
      const topup = await tx.walletTopup.findUnique({
        where: { id: input.targetId },
        include: { bridgeClaim: true, qrisInvoiceAttempt: true },
      });
      if (!topup || topup.status === "PAID") {
        throw new PaymentReconciliationError("target_unavailable");
      }
      if (
        topup.paymentMethod !== walletTopupPaymentMethodForProvider(provider)
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      if (event.amount !== topup.billedAmount) {
        throw new PaymentReconciliationError("amount_mismatch");
      }
      if (
        provider !== "JAGO" &&
        qrisInvoiceEventBlockReason({
          targetKind: "wallet_topup",
          targetId: topup.id,
          billedAmount: topup.billedAmount,
          createdAt: topup.createdAt,
          expiresAt: topup.expiresAt,
          bridgeClaim: topup.bridgeClaim,
          attempt: topup.qrisInvoiceAttempt,
          event,
          allowRejectedEvent: true,
        })
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      eventWindow({ amount: event.amount, postedAt: event.postedAt }, topup);
      late = lateTarget({ status: topup.status, expiresAt: topup.expiresAt, now: input.now });
      await tx.bridgePaymentEvent.update({
        where: { eventId: input.eventId },
        data: { walletTopupId: input.targetId, orderId: null },
      });
    }
    return { eventId: input.eventId, targetKind: input.targetKind, targetId: input.targetId, late };
  });
}

async function creditLatePayment(input: {
  eventId: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  adminEmail: string;
  reason: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`telegram_reconcile_event_${input.eventId}`}))`;
    const event = await tx.bridgePaymentEvent.findUnique({ where: { eventId: input.eventId } });
    if (!event) throw new PaymentReconciliationError("event_not_found");
    if (event.status === "CONFIRMED") throw new PaymentReconciliationError("already_confirmed");
    if (event.status !== "REJECTED") throw new PaymentReconciliationError("event_not_ready");
    if (!event.amount) throw new PaymentReconciliationError("amount_missing");
    const now = new Date();
    const actor = `admin:${input.adminEmail}`;
    const safeReason = sanitizeReconciliationReason(input.reason);
    if (input.targetKind === "wallet_topup") {
      const topup = await tx.walletTopup.findUnique({
        where: { id: input.targetId },
        include: {
          bridgeClaim: true,
          qrisInvoiceAttempt: true,
          jagoTransferAttempt: true,
        },
      });
      if (!topup || topup.status === "PAID") {
        throw new PaymentReconciliationError("target_unavailable");
      }
      const provider = reconciliationPaymentProvider(event);
      if (
        !provider ||
        topup.paymentMethod !== walletTopupPaymentMethodForProvider(provider)
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      if (event.walletTopupId !== topup.id || event.amount !== topup.billedAmount) {
        throw new PaymentReconciliationError("target_conflict");
      }
      if (
        provider !== "JAGO" &&
        qrisInvoiceEventBlockReason({
          targetKind: "wallet_topup",
          targetId: topup.id,
          billedAmount: topup.billedAmount,
          createdAt: topup.createdAt,
          expiresAt: topup.expiresAt,
          bridgeClaim: topup.bridgeClaim,
          attempt: topup.qrisInvoiceAttempt,
          event: { ...event, status: "REJECTED" },
          allowRejectedEvent: true,
          allowTerminalAttempt: true,
        })
      ) {
        throw new PaymentReconciliationError("provider_mismatch");
      }
      eventWindow({ amount: event.amount, postedAt: event.postedAt }, topup);
      const transaction = await applyWalletTransaction(tx, {
        chatId: topup.chatId,
        amount: topup.baseAmount,
        type: "TOPUP_CREDIT",
        idempotencyKey: `topup-credit:${topup.id}`,
        walletTopupId: topup.id,
        actor,
        note: `Rekonsiliasi pembayaran terlambat ${topup.invoiceNumber}`,
      });
      await tx.walletTopup.update({
        where: { id: topup.id },
        data: { status: "PAID", verifiedBy: actor, verifiedAt: now },
      });
      if (topup.paymentMethod === DANA_WALLET_TOPUP_METHOD) {
        if (topup.qrisInvoiceAttempt) {
          const attemptUpdated = await tx.qrisInvoiceAttempt.updateMany({
            where: {
              id: topup.qrisInvoiceAttempt.id,
              status: { in: ["AWAITING_PAYMENT", "MATCHED", "EXPIRED"] },
              matchedEventId: null,
            },
            data: {
              status: "CONFIRMED",
              matchedEventId: event.id,
              matchedAt: now,
            },
          });
          if (attemptUpdated.count !== 1) {
            throw new PaymentReconciliationError("target_unavailable");
          }
        }
        await tx.bridgePaymentClaim.updateMany({
          where: { walletTopupId: topup.id },
          data: { status: "CONFIRMED", confirmedAt: now },
        });
      }
      if (topup.paymentMethod === JAGO_TRANSFER_METHOD) {
        const attemptUpdated = await tx.jagoWalletTopupAttempt.updateMany({
          where: {
            walletTopupId: topup.id,
            status: { in: ["AWAITING_TRANSFER", "EXPIRED"] },
            matchedEventId: null,
          },
          data: {
            status: "CONFIRMED",
            matchedEventId: event.eventId,
            matchedAt: now,
          },
        });
        if (attemptUpdated.count !== 1) {
          throw new PaymentReconciliationError("target_unavailable");
        }
      }
      await tx.telegramNotification.upsert({
        where: { dedupeKey: walletTopupSuccessDedupeKey(topup.id) },
        create: {
          dedupeKey: walletTopupSuccessDedupeKey(topup.id),
          chatId: topup.chatId,
          walletTopupId: topup.id,
          kind: "WALLET_TOPUP_SUCCESS",
          priority: 10,
        },
        update: {},
      });
      await tx.bridgePaymentEvent.update({
        where: { eventId: input.eventId },
        data: {
          status: "CONFIRMED",
          walletTopupId: topup.id,
          confirmedAt: now,
          reason: `Manual reconciliation: ${safeReason}`,
        },
      });
      return transaction;
    }

    const payment = await tx.payment.findUnique({
      where: { orderId: input.targetId },
      include: {
        order: {
          include: { bridgeClaim: true, qrisInvoiceAttempt: true },
        },
      },
    });
    if (!payment) throw new PaymentReconciliationError("target_unavailable");
    const provider = reconciliationPaymentProvider(event);
    if (
      !provider ||
      !orderPaymentMethodMatchesProvider(provider, payment.method)
    ) {
      throw new PaymentReconciliationError("provider_mismatch");
    }
    if (event.orderId !== payment.orderId || event.amount !== payment.billedAmount) {
      throw new PaymentReconciliationError("target_conflict");
    }
    if (
      provider !== "JAGO" &&
      qrisInvoiceEventBlockReason({
        targetKind: "order",
        targetId: payment.orderId,
        billedAmount: payment.billedAmount,
        createdAt: payment.createdAt,
        expiresAt: payment.expiresAt,
        bridgeClaim: payment.order.bridgeClaim,
        attempt: payment.order.qrisInvoiceAttempt,
        event: { ...event, status: "REJECTED" },
        allowRejectedEvent: true,
        allowTerminalAttempt: true,
      })
    ) {
      throw new PaymentReconciliationError("provider_mismatch");
    }
    eventWindow({ amount: event.amount, postedAt: event.postedAt }, payment);
    const result = await creditExpiredOrderPaymentToWalletTx(tx, {
      orderId: payment.orderId,
      actor,
      note: `Pembayaran terlambat untuk ${payment.invoiceNumber}`,
      bridgeEventId: event.eventId,
      bridgeEventDatabaseId: event.id,
    });
    await tx.bridgePaymentEvent.update({
      where: { eventId: input.eventId },
      data: {
        status: "CONFIRMED",
        orderId: payment.orderId,
        confirmedAt: now,
        reason: `Manual reconciliation: ${safeReason}`,
      },
    });
    return result.transaction;
  });
}

export async function reconcilePaymentEvent(input: {
  eventId: string;
  targetKind: ReconciliationTargetKind;
  targetId: string;
  adminEmail: string;
  reason: string;
}) {
  const safeReason = sanitizeReconciliationReason(input.reason);
  if (safeReason.length < 3) {
    throw new PaymentReconciliationError("reason_required");
  }
  const reservation = await reserveEventTarget({
    eventId: input.eventId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    now: new Date(),
  });
  if (reservation.late) {
    return creditLatePayment({ ...input, reason: safeReason });
  }
  if (input.targetKind === "order") {
    return confirmOrderPayment({
      orderId: input.targetId,
      verifiedBy: `admin:${input.adminEmail}`,
      bridgeEventId: input.eventId,
      allowRejectedJagoEvent: true,
      allowRejectedQrisEvent: true,
    });
  }
  return confirmWalletTopup({ walletTopupId: input.targetId, verifiedBy: `admin:${input.adminEmail}`, bridgeEventId: input.eventId });
}

export function reconciliationEventWhere(
  query: string | undefined,
): Prisma.BridgePaymentEventWhereInput {
  const value = query?.trim().slice(0, 120) ?? "";
  if (!value) return {};
  return {
    OR: [
      { eventId: { contains: value, mode: "insensitive" } },
      { order: { is: { invoiceNumber: { contains: value, mode: "insensitive" } } } },
      { walletTopup: { is: { invoiceNumber: { contains: value, mode: "insensitive" } } } },
    ],
  };
}
