import Link from "next/link";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { formatRupiah } from "@/lib/catalog-types";
import type { StorefrontOrderDetail } from "@/lib/store-api-contract";
import { RefreshOrderButton, CancelOrderButton, CopyInvoiceButton } from "./order-actions";
import { DownloadDelivery } from "./download-delivery";
import { OrderLogin } from "./order-login";
import { OrderPaymentPanel } from "./order-payment-panel";
import { OrderResources } from "./order-resources";
import { SupportCard } from "../site/support-card";
import styles from "./order-detail.module.css";

export function orderPresentation(order: StorefrontOrderDetail) {
  if (order.status === "REFUNDED") return { label: "Dana dikembalikan", title: "Periksa saldo akunmu.", description: "Invoice ini sudah selesai dengan pengembalian dana. Rincian saldo tersedia di akunmu.", tone: "closed", icon: "wallet" as const };
  if (order.status === "EXPIRED") return { label: "Kedaluwarsa", title: "Waktu pembayaran berakhir.", description: "Sudah membayar? Jangan bayar ulang. Hubungi bantuan dengan nomor invoice ini.", tone: "closed", icon: "clock" as const };
  if (order.status === "CANCELLED") return { label: "Dibatalkan", title: "Pesanan telah dibatalkan.", description: "Kamu dapat kembali ke toko untuk membuat pesanan baru.", tone: "closed", icon: "receipt" as const };
  if (order.paymentStatus === "PAID") {
    if (order.deliveryState === "DELIVERED") return { label: "Selesai", title: "File produkmu tetap tersedia.", description: "Terima kasih sudah belanja di BWR Tele. File dan panduan tetap tersedia di pesanan ini.", tone: "success", icon: "circle-check" as const };
    if (order.deliveryState === "READY") return { label: "Siap diambil", title: "Produkmu sudah siap!", description: "Pembayaran diterima. Download file produk, lalu ikuti panduan penggunaannya.", tone: "success", icon: "cube" as const };
    return { label: "Sedang diproses", title: order.status === "PAID_WAITING_STOCK" ? "Menunggu ketersediaan produk." : "Kami sedang menyiapkan produkmu.", description: "Pembayaran sudah diterima. Tidak perlu membayar lagi. File akan muncul setelah produk siap.", tone: "processing", icon: "clock" as const };
  }
  return { label: "Menunggu pembayaran", title: "Selesaikan pembayaranmu.", description: "Bayar sesuai nominal invoice, lalu periksa status untuk mengambil produkmu.", tone: "pending", icon: "receipt" as const };
}

const date = (value: string) => new Date(value).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });

export function OrderDetailView({ order }: { order: StorefrontOrderDetail }) {
  const state = orderPresentation(order);
  const paid = order.paymentStatus === "PAID";
  const pending = order.status === "PENDING_PAYMENT";
  const accessible = state.tone === "success" && paid && ["READY", "DELIVERED"].includes(order.deliveryState);
  const artwork = state.tone === "success" ? "/illustrations/invoice-success.webp" : ["pending", "processing"].includes(state.tone) ? "/illustrations/invoice-pending.webp" : null;
  const hasBundle = accessible && order.deliveries.length > 1 && order.deliveries.length === order.quantity && order.deliveries.every(item => ["READY", "SENT"].includes(item.status));
  return <div className={styles.workspace}>
    <header className={styles.header}>
      <Link className={styles.back} href="/orders"><Icon name="chevron-left" size={16} /> Semua pesanan</Link>
      <div className={styles.titleRow}><div><span className={styles.eyebrow}>DETAIL PESANAN</span><h1>{order.productName}</h1><p className={styles.invoice}>Invoice <code>{order.invoiceNumber}</code><CopyInvoiceButton invoiceNumber={order.invoiceNumber} /></p></div>{!pending ? <RefreshOrderButton invoiceNumber={order.invoiceNumber} /> : null}</div>
    </header>
    <section className={`${styles.status} ${artwork ? styles.withArtwork : ""}`} data-tone={state.tone} aria-label="Status pesanan">
      {artwork ? <Image className={styles.artwork} src={artwork} alt="" width={160} height={120} sizes="160px" /> : null}
      <span className={styles.statusIcon}><Icon name={state.icon} size={28} /></span>
      <div><span className={styles.badge}>{state.label}</span><h2>{state.title}</h2><p>{state.description}</p></div>
      {accessible ? <a className="button button-primary" href="#order-products">Lihat produk <Icon name="arrow-right" size={17} /></a> : order.status === "REFUNDED" ? <Link className="button button-quiet" href="/account">Lihat saldo</Link> : null}
    </section>
    <div className={styles.layout}>
      <div className={styles.primary}>
        {!paid || state.tone === "closed" ? <OrderPaymentPanel order={order} /> : null}
        {(paid || order.deliveries.length > 0) && state.tone !== "closed" ? <section id="order-products" tabIndex={-1} className={`order-delivery-panel ${styles.deliveries}`}>
          <div className="order-delivery-heading"><div><h2>File produkmu</h2><p>{order.deliveries.length ? `${order.deliveries.length} file • Unduhan pribadi untuk akunmu` : "File akan tersedia setelah produk siap."}</p></div>{hasBundle ? <DownloadDelivery bundle invoice={order.invoiceNumber} filename="produk-gabungan.zip" /> : null}</div>
          {order.deliveries.length === 0 ? <div className={styles.waiting}><Icon name="cube" size={28} /><div><strong>Produk sedang disiapkan</strong><p>Periksa status kembali nanti. Kamu tidak perlu membuat pesanan baru.</p></div></div> : <div className="web-delivery-list">{order.deliveries.map(delivery => <article key={delivery.id}>
            <span className={styles.fileIcon}><Icon name="receipt" size={22} /></span><div><strong>File {delivery.unitNumber}</strong><span>{delivery.filename}</span><small>{delivery.status === "SENT" ? "Pernah diunduh • Bisa diunduh kembali" : delivery.status === "READY" ? "Siap diunduh" : "Sedang disiapkan"}</small></div>
            {paid && ["READY", "SENT"].includes(delivery.status) ? <DownloadDelivery invoice={order.invoiceNumber} receipt={delivery.id} filename={delivery.filename} downloaded={delivery.status === "SENT"} /> : <span>Belum siap</span>}
          </article>)}</div>}
        </section> : null}
        {paid && order.deliveredFiles > 0 && state.tone !== "closed" ? <OrderLogin key={order.invoiceNumber} invoiceNumber={order.invoiceNumber} /> : null}
      </div>
      <aside className={styles.summary} aria-label="Ringkasan transaksi"><h2><Icon name="receipt" size={21} /> Ringkasan transaksi</h2><div className={styles.amount}><span>Total pembayaran</span><strong>{formatRupiah(order.billedAmount)}</strong></div>
        <dl><div><dt>Jumlah produk</dt><dd>{order.quantity} item</dd></div><div><dt>Metode pembayaran</dt><dd>{order.paymentMethod?.replaceAll("_", " ") ?? "—"}</dd></div><div><dt>Dibuat</dt><dd>{date(order.createdAt)} WIB</dd></div>{paid && order.paidAt ? <div><dt>Dibayar</dt><dd>{date(order.paidAt)} WIB</dd></div> : null}{pending ? <div><dt>Batas pembayaran</dt><dd>{date(order.expiresAt)} WIB</dd></div> : null}<div><dt>Status</dt><dd>{state.label}</dd></div></dl>
        <p className={styles.security}><Icon name="shield-check" size={18} /> File hanya dapat diakses oleh pemilik pesanan.</p>
        {pending ? <CancelOrderButton invoiceNumber={order.invoiceNumber} /> : null}
      </aside>
      {order.guidance.length || order.attachments.length ? <div className={styles.resources}><OrderResources invoiceNumber={order.invoiceNumber} guidance={order.guidance} attachments={order.attachments} /></div> : null}
    </div>
    <SupportCard invoice={order.invoiceNumber} />
  </div>;
}
