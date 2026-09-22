import Link from "next/link";
import { CopyValueButton } from "@/components/admin/copy-value-button";
import { OrderMessageComposer } from "@/components/admin/order-message-composer";
import { orderDetailDateLabel } from "@/components/admin/orders/labels";
import type { AdminOrderDetailView } from "@/server/admin/orders/detail";
import { formatRupiah } from "@/server/utils/format";
import { AdminOrderPaymentAction } from "@/components/admin/admin-order-payment-action";

type OrderOverviewProps = Pick<
  AdminOrderDetailView,
  "order" | "wallet" | "canCancelPreorder"
>;

export function OrderOverview({ order, wallet, canCancelPreorder }: OrderOverviewProps) {
  return (
    <>
      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Buyer</p>
              <h2>{order.channel === "WEB" ? "Akun website" : "Identitas Telegram"}</h2>
            </div>
          </div>
          <p><strong>Username:</strong> {order.buyerUsername ? `@${order.buyerUsername}` : "-"}</p>
          <p><strong>Nama:</strong> {order.buyerDisplayName ?? "-"}</p>
          <p><strong>{order.channel === "WEB" ? "Email akun:" : "Chat ID:"}</strong> {order.channel === "WEB" ? order.buyerEmail ?? "Belum tersedia" : order.chatId}</p>
          {order.channel !== "WEB" ? <CopyValueButton label="Salin Chat ID" value={order.chatId} /> : <p className="muted">Produk dan saldo tersedia melalui akun website. Pengguna tidak memerlukan Telegram.</p>}
          {order.channel !== "WEB" && !order.buyerUsername ? (
            <p className="muted">
              Username tidak tersedia, tetapi file tetap dapat dikirim lewat Chat ID ini.
            </p>
          ) : null}
          <p><strong>Saldo wallet:</strong> {formatRupiah(wallet?.balance ?? 0)}</p>
          <p><strong>Email lama:</strong> {order.buyerEmail ?? "-"}</p>
          {order.buyerUsername ? (
            <a
              className="button button-small"
              href={`https://t.me/${order.buyerUsername}`}
              rel="noreferrer"
              target="_blank"
            >
              Buka Telegram
            </a>
          ) : null}
          {wallet ? (
            <Link className="button button-small button-ghost" href={`/admin/wallet/${encodeURIComponent(order.chatId)}`} prefetch={false}>
              Buka wallet
            </Link>
          ) : null}
        </article>

        <article className="panel panel-dark">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Payment</p>
              <h2>Status transaksi</h2>
            </div>
          </div>
          <p><strong>Produk:</strong> {order.items[0]?.productNameSnapshot ?? "-"}</p>
          <p><strong>Jumlah:</strong> {order.items.length} akun</p>
          <p><strong>Pembayaran:</strong> {order.payment?.status ?? "-"}</p>
          <p><strong>Metode:</strong> {order.payment?.method ?? "-"}</p>
          <p><strong>Kode unik:</strong> {order.payment?.uniqueCode ? `Rp${order.payment.uniqueCode}` : "-"}</p>
          {order.binanceInternalPaymentAttempt ? (
            <>
              <p><strong>Status Binance:</strong> {order.binanceInternalPaymentAttempt.status}</p>
              <p><strong>Order ID Binance:</strong> {order.binanceInternalPaymentAttempt.submittedOrderId ?? "Belum dikirim"}</p>
              <p><strong>Binance ID tujuan:</strong> {order.binanceInternalPaymentAttempt.recipientBinanceIdSnapshot}</p>
            </>
          ) : null}
          {order.jagoTransferAttempt ? (
            <>
              <p><strong>Status Bank Jago:</strong> {order.jagoTransferAttempt.status}</p>
              <p><strong>Rekening tujuan:</strong> {order.jagoTransferAttempt.recipientAccountNumberSnapshot}</p>
              <p><strong>Event pembayaran:</strong> {order.jagoTransferAttempt.matchedEventId ?? "Belum terdeteksi"}</p>
              <p><strong>Terdeteksi:</strong> {orderDetailDateLabel(order.jagoTransferAttempt.matchedAt)}</p>
            </>
          ) : null}
          <p><strong>Lunas:</strong> {orderDetailDateLabel(order.paidAt)}</p>
          <p><strong>Refund saldo:</strong> {orderDetailDateLabel(order.refundedAt)}</p>
          <p><strong>Kedaluwarsa:</strong> {orderDetailDateLabel(order.expiresAt)}</p>
          <p><strong>Estimasi preorder:</strong> {order.preorderEtaText ?? "-"}</p>
          <CopyValueButton label="Salin invoice" value={order.invoiceNumber} />
          <AdminOrderPaymentAction
            now={new Date()}
            order={order}
            returnTo={`/admin/orders/${order.id}`}
          />
          <Link className="button button-light button-small" href="/admin/orders" prefetch={false}>
            Kembali ke semua order
          </Link>
        </article>
      </section>

      <section className="dashboard-grid">
        {order.channel !== "WEB" ? <article className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Direct communication</p>
              <h2>Kirim pesan ke pembeli</h2>
            </div>
          </div>
          <p className="muted">
            Pesan dikirim ke Chat ID {order.chatId} dan statusnya tercatat di outbox.
          </p>
          <OrderMessageComposer
            action={`/api/admin/orders/${order.id}/message`}
            invoice={order.invoiceNumber}
            productName={order.items[0]?.productNameSnapshot ?? "produk"}
          />
        </article> : <article className="panel"><h2>Akses pembeli Web</h2><p>Riwayat pesanan, unduhan, dan saldo tersedia di akun website pembeli. Tidak ada pengiriman ke Chat ID Telegram untuk order ini.</p></article>}

        <article className="panel panel-dark">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Paid preorder control</p>
              <h2>Batalkan &amp; refund</h2>
            </div>
          </div>
          {canCancelPreorder ? (
            <form
              action={`/api/admin/orders/${order.id}/cancel-preorder`}
              className="stack-form"
              method="post"
            >
              <p>
                Refund ke wallet: <strong>{formatRupiah(order.grandTotal)}</strong>
              </p>
              <label>
                Alasan pembatalan
                <textarea
                  name="reason"
                  maxLength={500}
                  minLength={3}
                  placeholder="Contoh: stok tidak dapat dipenuhi sesuai estimasi."
                  required
                  rows={4}
                />
              </label>
              <button className="button button-danger" type="submit">
                Batalkan preorder &amp; refund
              </button>
            </form>
          ) : (
            <p className="muted">
              Cancel hanya tersedia ketika preorder sudah lunas dan masih menunggu stok.
              Setelah file dialokasikan atau dikirim, refund otomatis diblokir.
            </p>
          )}
        </article>
      </section>
    </>
  );
}
