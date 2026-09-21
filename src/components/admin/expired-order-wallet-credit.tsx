import { WalletCards } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import {
  expiredOrderWalletCreditAmount,
  isExpiredOrderWalletCreditPaymentMethod,
} from "@/server/wallet/expired-order-credit";
import { formatRupiah } from "@/server/utils/format";
import {
  externalIdrProviderForOrderPaymentMethod,
  externalIdrProviderLabel,
} from "@/server/payment/provider-methods";

type ExpiredOrderWalletCreditProps = {
  returnTo?: string;
  order: {
    id: string;
    invoiceNumber: string;
    status: string;
    paymentStatus: string;
    serviceFee: number;
    payment: {
      billedAmount: number;
      uniqueCode: number | null;
      method: string;
      status: string;
    } | null;
  };
};

export function ExpiredOrderWalletCredit({ order, returnTo }: ExpiredOrderWalletCreditProps) {
  if (order.status !== "EXPIRED" || !order.payment) return null;
  if (order.paymentStatus === "PAID" || order.payment.status === "PAID") {
    return <span className="status-pill status-good">Sudah masuk wallet</span>;
  }
  if (
    order.paymentStatus !== "EXPIRED" ||
    order.payment.status !== "EXPIRED" ||
    !isExpiredOrderWalletCreditPaymentMethod(order.payment.method)
  ) {
    return null;
  }

  let amount: number;
  try {
    amount = expiredOrderWalletCreditAmount({
      billedAmount: order.payment.billedAmount,
      uniqueCode: order.payment.uniqueCode,
      serviceFee: order.serviceFee,
    });
  } catch {
    return <span className="status-pill status-bad">Nominal tidak valid</span>;
  }
  const paymentProvider = externalIdrProviderForOrderPaymentMethod(
    order.payment.method,
  );
  if (!paymentProvider) return null;
  const provider = externalIdrProviderLabel(paymentProvider);

  return (
    <form action={`/api/admin/orders/${order.id}/credit-expired-payment`} method="post">
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <AdminConfirmSubmitButton
        className="button button-small"
        confirmText={`Tambah ${formatRupiah(amount)}`}
        description={`Pastikan pembayaran ${order.invoiceNumber} benar-benar sudah masuk ke ${provider}. Wallet akan ditambah ${formatRupiah(amount)} tanpa kode unik dan produk tetap tidak dikirim.`}
        title="Masukkan pembayaran expired ke wallet?"
      >
        <WalletCards aria-hidden="true" size={15} /> Add {formatRupiah(amount)}
      </AdminConfirmSubmitButton>
    </form>
  );
}
