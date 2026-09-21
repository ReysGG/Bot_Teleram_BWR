import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { ConfirmLocalTestPaymentButton, RefreshOrderButton } from "@/components/orders/order-actions";
import { localTestPaymentsAllowed } from "@/lib/test-payments";
import { PaymentReferenceForm } from "@/components/orders/payment-reference-form";
import { formatRupiah } from "@/lib/catalog-types";
import type { StorefrontOrderDetail } from "@/lib/store-api-contract";

function closedPaymentMessage(order: StorefrontOrderDetail) {
  if (order.status === "CANCELLED") {
    return "Invoice ini sudah dibatalkan. Buat checkout baru jika masih ingin membeli produk.";
  }
  if (order.status === "EXPIRED") {
    return "Batas pembayaran invoice sudah berakhir. Jika sudah membayar, jangan bayar ulang; hubungi admin untuk pemeriksaan pembayaran. Jika belum membayar, buat checkout baru.";
  }
  if (order.status === "REFUNDED") {
    return "Dana pesanan ini sudah dikembalikan. Lihat riwayat saldo pada halaman akun untuk rincian pengembaliannya.";
  }
  return null;
}

export function OrderPaymentPanel({ order }: { order: StorefrontOrderDetail }) {
  const payment = order.paymentInstructions;
  const closedMessage = closedPaymentMessage(order);

  return (
    <article className={`order-detail-panel payment-instruction-panel${payment?.type === "QRIS" && order.status === "PENDING_PAYMENT" ? " mobile-qris-first" : ""}`}>
      <h2>Pembayaran</h2>
      {order.status === "PENDING_PAYMENT" ? <p className="payment-deadline">Bayar sebelum <strong>{new Date(order.expiresAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })} WIB</strong></p> : null}
      {closedMessage ? (
        <p>{closedMessage}</p>
      ) : order.paymentStatus === "PAID" ? (
        <div className="payment-confirmed">
          <span aria-hidden="true"><Icon name="check" size={22} /></span>
          <div>
            <strong>Pembayaran sudah diterima</strong>
            <p>{["READY", "DELIVERED"].includes(order.deliveryState) ? "Tidak perlu membayar lagi. File produk tersedia di pesanan ini." : "Tidak perlu membayar lagi. Produk masih disiapkan dan file belum tersedia."}</p>
          </div>
        </div>
      ) : !payment ? (
        <p>Petunjuk pembayaran belum tersedia.</p>
      ) : payment.type === "QRIS" ? (
        <div className="qris-payment-view">
          <Image
            alt={`QRIS ${order.invoiceNumber}`}
            height={300}
            src={`/api/orders/${encodeURIComponent(order.invoiceNumber)}/qris`}
            unoptimized
            width={300}
          />
          <strong>Bayar tepat {formatRupiah(payment.amount)}</strong>
          <span>Scan dengan aplikasi bank atau e-wallet. Setelah membayar, tekan Refresh status.</span>
        </div>
      ) : payment.type === "JAGO_TRANSFER" ? (
        <div className="payment-copy">
          <span>Rekening Bank Jago</span>
          <code>{payment.accountNumber}</code>
          <strong>{formatRupiah(payment.amount)}</strong>
        </div>
      ) : payment.type === "BINANCE_INTERNAL" ? (
        <div className="payment-copy">
          <span>Binance ID</span>
          <code>{payment.recipientId}</code>
          <strong>{payment.amountUsdt} USDT</strong>
          {!payment.submittedOrderId ? (
            <PaymentReferenceForm invoice={order.invoiceNumber} type="BINANCE_INTERNAL" />
          ) : (
            <span>Order ID: {payment.submittedOrderId}</span>
          )}
        </div>
      ) : payment.type === "USDT_BEP20" ? (
        <div className="payment-copy">
          <span>Alamat BEP20</span>
          <code>{payment.recipientAddress}</code>
          <strong>{payment.amountUsdt} USDT</strong>
          {!payment.txHash ? (
            <PaymentReferenceForm invoice={order.invoiceNumber} type="USDT_BEP20" />
          ) : (
            <span>
              Hash: {payment.txHash} - Konfirmasi {payment.confirmations ?? 0}/{payment.requiredConfirmations}
            </span>
          )}
        </div>
      ) : (
        <p>Pembayaran menggunakan saldo sebesar {formatRupiah(payment.amount)}.</p>
      )}
      {order.status === "PENDING_PAYMENT" ? <div className="payment-refresh"><RefreshOrderButton invoiceNumber={order.invoiceNumber} /></div> : null}
      {localTestPaymentsAllowed() &&
      order.status === "PENDING_PAYMENT" &&
      order.paymentStatus !== "PAID" ? (
        <ConfirmLocalTestPaymentButton invoiceNumber={order.invoiceNumber} />
      ) : null}
    </article>
  );
}
