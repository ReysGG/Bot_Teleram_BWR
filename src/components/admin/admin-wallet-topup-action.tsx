import Link from "next/link";
import { BadgeCheck, Search } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { adminWalletTopupRecoveryAction } from "@/server/payment/admin-recovery-policy";
import { externalIdrProviderLabel } from "@/server/payment/provider-methods";
import { formatRupiah } from "@/server/utils/format";

export function AdminWalletTopupAction({
  now,
  returnTo,
  topup,
}: {
  now: Date;
  returnTo: string;
  topup: {
    id: string;
    invoiceNumber: string;
    status: string;
    paymentMethod: string;
    billedAmount: number;
    baseAmount: number;
    expiresAt: Date;
  };
}) {
  const action = adminWalletTopupRecoveryAction({
    status: topup.status,
    paymentMethod: topup.paymentMethod,
    expiresAt: topup.expiresAt,
    now,
  });
  if (action.kind === "CONFIRM_ACTIVE") {
    const provider = externalIdrProviderLabel(action.provider);
    return (
      <form action={`/api/admin/wallet/topups/${topup.id}/confirm`} method="post">
        <input name="returnTo" type="hidden" value={returnTo} />
        <AdminConfirmSubmitButton
          className="button button-small"
          confirmText={`Konfirmasi ${formatRupiah(topup.baseAmount)}`}
          description={`Pastikan ${formatRupiah(topup.billedAmount)} sudah masuk melalui ${provider}. Saldo ${formatRupiah(topup.baseAmount)} akan ditambahkan satu kali ke wallet user.`}
          title="Konfirmasi top up manual?"
        >
          <BadgeCheck aria-hidden="true" size={15} /> Konfirmasi
        </AdminConfirmSubmitButton>
      </form>
    );
  }
  if (action.kind === "RECONCILE_EVENT") {
    return (
      <Link className="button button-small button-ghost" href="/admin/payments/reconciliation?status=problem" prefetch={false}>
        <Search aria-hidden="true" size={15} /> Cari event
      </Link>
    );
  }
  if (action.kind === "BLOCKED" && action.reason === "AWAITING_EXPIRY_WORKER") {
    return <span className="status-pill status-warn">Menunggu expiry</span>;
  }
  return <span className="muted">-</span>;
}
