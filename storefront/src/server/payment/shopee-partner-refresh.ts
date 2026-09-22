import { prisma } from "@/server/db/prisma";
import { pollActiveShopeePartnerSessions } from "@/server/payment/shopee-partner-worker";
import { matchShopeePartnerTransaction } from "@/server/payment/shopee-partner-matching";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { confirmWalletTopup } from "@/server/wallet/topup";

export type ShopeePaymentRefreshResult = {
  state: "CONFIRMED" | "PENDING" | "EXPIRED" | "LEGACY" | "NOT_APPLICABLE";
  message: string;
};

type ShopeeRefreshAttempt = {
  id: string;
  evidenceMode: string;
  providerKeySnapshot: string;
  shopeeSessionIdSnapshot: string | null;
  shopeeAccountFingerprintSnapshot: string | null;
  amount: number;
  createdAt: Date;
  expiresAt: Date;
};

const REFRESH_CLOCK_SKEW_MS = 120_000;
const REFRESH_MAX_PAGES = 3;

async function refreshShopeeInvoiceEvidence(input: {
  attempt: ShopeeRefreshAttempt;
  target: { kind: "order" | "wallet_topup"; id: string };
  confirm: (transactionId: string) => Promise<void>;
}): Promise<ShopeePaymentRefreshResult> {
  const attempt = input.attempt;
  const now = new Date();
  // A targeted refresh needs only this invoice's payment window, not a full
  // 24-hour history scan. The normal background poll still maintains history.
  const forceLookbackMs = Math.max(
    REFRESH_CLOCK_SKEW_MS,
    now.getTime() - attempt.createdAt.getTime() + REFRESH_CLOCK_SKEW_MS,
  );
  await pollActiveShopeePartnerSessions(now, {
    sessionId: attempt.shopeeSessionIdSnapshot ?? undefined,
    forceLookbackMs,
    maxPages: REFRESH_MAX_PAGES,
  });

  const candidates = await prisma.shopeePartnerTransaction.findMany({
    where: {
      merchantAccountFingerprint: attempt.shopeeAccountFingerprintSnapshot!,
      amount: attempt.amount,
      status: { in: ["RECEIVED", "UNMATCHED", "AMBIGUOUS", "MATCHED"] },
      occurredAt: {
        gte: new Date(attempt.createdAt.getTime() - 120_000),
        lte: new Date(attempt.expiresAt.getTime() + 120_000),
      },
    },
    select: { externalTransactionId: true },
    orderBy: { occurredAt: "asc" },
    take: 20,
  });

  if (candidates.length > 1) {
    return {
      state: "PENDING",
      message: "Ada lebih dari satu transaksi Shopee dengan nominal yang sama dalam waktu invoice. Admin perlu melakukan rekonsiliasi; pembayaran tidak dikonfirmasi otomatis.",
    };
  }

  let ambiguous = false;
  for (const candidate of candidates) {
    const result = await matchShopeePartnerTransaction({
      merchantAccountFingerprint: attempt.shopeeAccountFingerprintSnapshot!,
      externalTransactionId: candidate.externalTransactionId,
      invoiceAttemptId: attempt.id,
    });
    if (result.outcome === "AMBIGUOUS") {
      ambiguous = true;
      continue;
    }
    if (result.outcome === "ALREADY_CONFIRMED") {
      return { state: "CONFIRMED", message: "Pembayaran Shopee sudah terkonfirmasi." };
    }
    if (
      result.outcome !== "MATCHED" ||
      result.target.kind !== input.target.kind ||
      result.target.id !== input.target.id
    ) {
      continue;
    }
    await input.confirm(candidate.externalTransactionId);
    return {
      state: "CONFIRMED",
      message: input.target.kind === "wallet_topup"
        ? "Pembayaran Shopee ditemukan dan saldo wallet sudah dikreditkan."
        : "Pembayaran Shopee ditemukan dan order dikonfirmasi.",
    };
  }

  return {
    state: "PENDING",
    message: ambiguous
      ? "Ada lebih dari satu transaksi yang mungkin cocok. Admin perlu melakukan rekonsiliasi; pembayaran tidak dikonfirmasi otomatis."
      : "Belum ada transaksi Shopee yang cocok. Pastikan nominal tepat dan coba refresh lagi beberapa detik kemudian.",
  };
}

/**
 * Runs an on-demand poll/match for the buyer's active Shopee web-session
 * invoice. Legacy Android snapshots stay fail-closed and explain why they
 * cannot be silently converted to web evidence.
 */
export async function refreshShopeePaymentForOrder(input: {
  orderId: string;
  chatId: string;
}): Promise<ShopeePaymentRefreshResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, chatId: input.chatId },
    select: {
      status: true,
      paymentStatus: true,
      payment: { select: { status: true, expiresAt: true } },
      qrisInvoiceAttempt: {
        select: {
          id: true,
          evidenceMode: true,
          providerKeySnapshot: true,
          shopeeSessionIdSnapshot: true,
          shopeeAccountFingerprintSnapshot: true,
          amount: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!order?.payment) {
    return { state: "NOT_APPLICABLE", message: "Order tidak ditemukan." };
  }
  if (order.paymentStatus === "PAID" || order.payment.status === "PAID") {
    return { state: "CONFIRMED", message: "Pembayaran sudah terkonfirmasi." };
  }
  if (order.qrisInvoiceAttempt?.providerKeySnapshot !== "SHOPEE_PARTNER") {
    return { state: "NOT_APPLICABLE", message: "Invoice ini bukan invoice Shopee Partner." };
  }
  if (order.payment.expiresAt <= new Date()) {
    return {
      state: "EXPIRED",
      message: "Invoice sudah kedaluwarsa. Pembayaran terlambat tidak dikirim otomatis; gunakan recovery wallet/admin.",
    };
  }
  if (order.qrisInvoiceAttempt.evidenceMode !== "WEB_SESSION") {
    return {
      state: "LEGACY",
      message: "Invoice ini dibuat sebelum Shopee web-session aktif. Buat invoice QRIS baru agar refresh cookie dapat digunakan.",
    };
  }
  if (order.status !== "PENDING_PAYMENT" || order.payment.status !== "PENDING") {
    return { state: "PENDING", message: "Status invoice sudah berubah. Tekan refresh status untuk melihat hasil terbaru." };
  }

  const attempt = order.qrisInvoiceAttempt;
  if (!attempt?.id || !attempt.shopeeAccountFingerprintSnapshot) {
    return {
      state: "PENDING",
      message: "Invoice belum memiliki binding akun Shopee yang valid. Buat invoice baru setelah binding selesai.",
    };
  }

  const refreshedEvidence = await refreshShopeeInvoiceEvidence({
    attempt,
    target: { kind: "order", id: input.orderId },
    confirm: (transactionId) => confirmOrderPayment({
      orderId: input.orderId,
      verifiedBy: `shopee-partner-refresh:${transactionId}`,
      shopeePartnerTransactionId: transactionId,
    }).then(() => undefined),
  });
  if (refreshedEvidence.state === "CONFIRMED") return refreshedEvidence;

  const refreshed = await prisma.order.findFirst({
    where: { id: input.orderId, chatId: input.chatId },
    select: { status: true, paymentStatus: true, payment: { select: { status: true } } },
  });
  if (refreshed?.paymentStatus === "PAID" || refreshed?.payment?.status === "PAID") {
    return { state: "CONFIRMED", message: "Pembayaran Shopee ditemukan dan sedang diproses." };
  }
  return refreshedEvidence;
}

export async function refreshShopeePaymentForWalletTopup(input: {
  invoiceNumber: string;
  chatId: string;
}): Promise<ShopeePaymentRefreshResult> {
  const topup = await prisma.walletTopup.findFirst({
    where: { invoiceNumber: input.invoiceNumber, chatId: input.chatId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      expiresAt: true,
      qrisInvoiceAttempt: {
        select: {
          id: true,
          evidenceMode: true,
          providerKeySnapshot: true,
          shopeeSessionIdSnapshot: true,
          shopeeAccountFingerprintSnapshot: true,
          amount: true,
          createdAt: true,
          expiresAt: true,
        },
      },
    },
  });
  if (!topup?.qrisInvoiceAttempt) {
    return { state: "NOT_APPLICABLE", message: "Invoice top up tidak ditemukan." };
  }
  if (topup.status === "PAID") {
    return { state: "CONFIRMED", message: "Saldo wallet sudah terisi." };
  }
  if (topup.paymentMethod !== "DANA_RELAY" || topup.qrisInvoiceAttempt.providerKeySnapshot !== "SHOPEE_PARTNER") {
    return { state: "NOT_APPLICABLE", message: "Invoice ini bukan invoice Shopee Partner." };
  }
  if (topup.expiresAt <= new Date()) {
    return {
      state: "EXPIRED",
      message: "Invoice top up sudah kedaluwarsa. Pembayaran terlambat tidak dikreditkan otomatis; gunakan recovery admin.",
    };
  }
  if (topup.qrisInvoiceAttempt.evidenceMode !== "WEB_SESSION") {
    return {
      state: "LEGACY",
      message: "Invoice ini dibuat sebelum Shopee web-session aktif. Buat invoice top up QRIS baru agar refresh cookie dapat digunakan.",
    };
  }
  if (topup.status !== "PENDING") {
    return { state: "PENDING", message: "Status top up sudah berubah. Refresh wallet untuk melihat hasil terbaru." };
  }
  const attempt = topup.qrisInvoiceAttempt;
  if (!attempt.shopeeAccountFingerprintSnapshot) {
    return { state: "PENDING", message: "Invoice belum memiliki binding akun Shopee yang valid." };
  }
  return refreshShopeeInvoiceEvidence({
    attempt,
    target: { kind: "wallet_topup", id: topup.id },
    confirm: (transactionId) => confirmWalletTopup({
      walletTopupId: topup.id,
      verifiedBy: `shopee-partner-refresh:${transactionId}`,
      shopeePartnerTransactionId: transactionId,
    }).then(() => undefined),
  });
}
