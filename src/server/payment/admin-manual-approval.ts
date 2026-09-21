import { prisma } from "@/server/db/prisma";
import {
  adminOrderPaymentRecoveryAction,
  adminWalletTopupRecoveryAction,
} from "@/server/payment/admin-recovery-policy";
import { confirmOrderPayment } from "@/server/payment/confirm-payment";
import { JAGO_TRANSFER_METHOD } from "@/server/payment/android-payment-provider";
import { confirmWalletTopup } from "@/server/wallet/topup";
import { validateManualCryptoApproval, type ManualCryptoApproval } from "./manual-crypto-policy";

export class AdminManualPaymentError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "AdminManualPaymentError";
    this.code = code;
  }
}

function recoveryErrorCode(kind: string, reason?: string): string {
  if (reason === "AWAITING_EXPIRY_WORKER") return "payment_expired";
  if (kind === "RECHECK_PROVIDER") return "provider_recheck_required";
  return "payment_unavailable";
}

export async function approveOrderPaymentManually(input: {
  orderId: string;
  adminEmail: string;
  manualCryptoApproval?: ManualCryptoApproval;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      status: true,
      paymentStatus: true,
      expiresAt: true,
      payment: { select: { status: true, method: true } },
    },
  });
  if (!order?.payment) throw new AdminManualPaymentError("payment_not_found");
  const action = adminOrderPaymentRecoveryAction({
    orderStatus: order.status,
    orderPaymentStatus: order.paymentStatus,
    paymentStatus: order.payment.status,
    paymentMethod: order.payment.method,
    expiresAt: order.expiresAt,
    now: new Date(),
  });
  if (action.kind !== "CONFIRM_ACTIVE" && action.kind !== "REVIEW_MANUAL_CRYPTO") {
    throw new AdminManualPaymentError(
      recoveryErrorCode(
        action.kind,
        action.kind === "BLOCKED" ? action.reason : undefined,
      ),
    );
  }
  const manualCryptoApproval = action.kind === "REVIEW_MANUAL_CRYPTO"
    ? validateManualCryptoApproval(order.payment.method, `admin:${input.adminEmail}`, input.manualCryptoApproval)
    : undefined;
  if (action.kind === "REVIEW_MANUAL_CRYPTO" && !manualCryptoApproval) throw new AdminManualPaymentError("manual_approval_reference_required");
  return confirmOrderPayment({
    orderId: input.orderId,
    verifiedBy: `admin:${input.adminEmail}`,
    allowManualJagoOverride:
      order.payment.method === JAGO_TRANSFER_METHOD,
    allowManualShopeeOverride: true,
    ...(manualCryptoApproval ? { manualCryptoApproval } : {}),
  });
}

export async function approveWalletTopupManually(input: {
  walletTopupId: string;
  adminEmail: string;
}) {
  const topup = await prisma.walletTopup.findUnique({
    where: { id: input.walletTopupId },
    select: { status: true, paymentMethod: true, expiresAt: true },
  });
  if (!topup) throw new AdminManualPaymentError("payment_not_found");
  const action = adminWalletTopupRecoveryAction({
    status: topup.status,
    paymentMethod: topup.paymentMethod,
    expiresAt: topup.expiresAt,
    now: new Date(),
  });
  if (action.kind !== "CONFIRM_ACTIVE") {
    throw new AdminManualPaymentError(
      recoveryErrorCode(
        action.kind,
        action.kind === "BLOCKED" ? action.reason : undefined,
      ),
    );
  }
  return confirmWalletTopup({
    walletTopupId: input.walletTopupId,
    verifiedBy: `admin:${input.adminEmail}`,
    allowManualTransferOverride: true,
  });
}
