import Link from "next/link";
import { BadgeCheck, RefreshCw } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { ExpiredOrderWalletCredit } from "@/components/admin/expired-order-wallet-credit";
import { adminOrderPaymentRecoveryAction } from "@/server/payment/admin-recovery-policy";
import { externalIdrProviderLabel } from "@/server/payment/provider-methods";
import { formatRupiah } from "@/server/utils/format";

type AdminOrderPaymentActionProps = {
  now: Date;
  returnTo: string;
  order: {
    id: string;
    invoiceNumber: string;
    status: string;
    paymentStatus: string;
    serviceFee: number;
    grandTotal: number;
    expiresAt: Date;
    payment: {
      billedAmount: number;
      uniqueCode: number | null;
      method: string;
      status: string;
    } | null;
  };
};

export function AdminOrderPaymentAction({
  now,
  order,
  returnTo,
}: AdminOrderPaymentActionProps) {
  if (!order.payment) return <span className="muted">-</span>;
  const action = adminOrderPaymentRecoveryAction({
    orderStatus: order.status,
    orderPaymentStatus: order.paymentStatus,
    paymentStatus: order.payment.status,
    paymentMethod: order.payment.method,
    expiresAt: order.expiresAt,
    now,
  });

  if (action.kind === "REVIEW_MANUAL_CRYPTO") {
    return <Link className="button button-small" href={`/admin/orders/${order.id}/payment-approval`} prefetch={false}>
      <BadgeCheck aria-hidden="true" size={15} /> Tinjau approval manual
    </Link>;
  }
  if (action.kind === "CONFIRM_ACTIVE") {
    const provider = externalIdrProviderLabel(action.provider);
    const amount = order.payment.billedAmount || order.grandTotal;
    return (
      <form action={`/api/admin/orders/${order.id}/confirm`} method="post">
        <input name="returnTo" type="hidden" value={returnTo} />
        <AdminConfirmSubmitButton
          className="button button-small"
          confirmText={`Konfirmasi ${provider}`}
          description={`Pastikan ${formatRupiah(amount)} sudah benar-benar masuk melalui ${provider}. Sistem kemudian memproses stok dan pengiriman secara idempotent.`}
          title="Konfirmasi pembayaran manual?"
        >
          <BadgeCheck aria-hidden="true" size={15} /> Konfirmasi
        </AdminConfirmSubmitButton>
      </form>
    );
  }
  if (action.kind === "CREDIT_EXPIRED_TO_WALLET") {
    return <ExpiredOrderWalletCredit order={order} returnTo={returnTo} />;
  }
  if (action.kind === "RECHECK_PROVIDER") {
    const href = action.provider === "BINANCE"
      ? "/admin/payments/binance"
      : "/admin/payments/usdt-bep20";
    return (
      <Link className="button button-small button-ghost" href={href} prefetch={false}>
        <RefreshCw aria-hidden="true" size={15} /> Cek provider
      </Link>
    );
  }
  if (action.kind === "BLOCKED" && action.reason === "AWAITING_EXPIRY_WORKER") {
    return <span className="status-pill status-warn">Menunggu expiry</span>;
  }
  return <span className="muted">-</span>;
}
