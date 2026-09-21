import Link from "next/link";
import { PackageCheck, Search, Send, ShieldAlert } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { EmptyState } from "@/components/admin/empty-state";
import type { AdminDeliveriesData } from "@/server/admin/deliveries";
import { maskInventoryFilename } from "@/server/admin/inventory";
import type { normalizeDeliveryFilterStatus } from "@/server/admin/status-filter";
import { buyerLabel } from "@/server/orders/buyer";
import { deliveryFeedbackState } from "@/server/telegram/delivery-feedback";

function dateLabel(value: Date | null) {
  return value ? value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "Belum dikonfirmasi";
}

function deliveryStatusLabel(status: "READY" | "SENDING" | "SENT" | "FAILED" | "UNKNOWN") {
  if (status === "READY") return "Siap diambil lewat website";
  if (status === "SENT") return "API Telegram menerima upload";
  if (status === "SENDING") return "Sedang dikirim";
  if (status === "FAILED") return "Gagal";
  return "Hasil ambigu";
}

function deliveryFilterLabel(status: ReturnType<typeof normalizeDeliveryFilterStatus>) {
  if (status === "READY") return "Siap diambil lewat website";
  if (status === "SENT") return "API Telegram menerima upload";
  if (status === "SENDING") return "Sedang dikirim";
  if (status === "ATTENTION") return "Semua yang perlu review";
  if (status === "REPORTED") return "Dilaporkan tidak terlihat";
  if (status === "UNKNOWN") return "Hasil Telegram ambigu";
  if (status === "FAILED") return "Gagal pasti";
  return "Semua status";
}

function deliveriesHref(input: { productId: string; search: string; status?: string }) {
  const params = new URLSearchParams();
  if (input.search) params.set("q", input.search);
  if (input.productId) params.set("product", input.productId);
  if (input.status) params.set("status", input.status);
  const suffix = params.toString();
  return suffix ? `/admin/deliveries?${suffix}` : "/admin/deliveries";
}

export function DeliveryMetrics({
  attentionCount,
  productId,
  reportedDeliveryRowCount,
  reportedOrderCount,
  search,
  sentCount,
  status,
  totalDeliveryCount,
  totalItems,
}: Pick<AdminDeliveriesData, "attentionCount" | "productId" | "reportedDeliveryRowCount" | "reportedOrderCount" | "search" | "sentCount" | "status" | "totalDeliveryCount" | "totalItems">) {
  return (
    <section className="metric-grid">
      <article className="metric-card accent-orange">
        <div className="metric-card-title"><span>Hasil filter saat ini</span><Search aria-hidden="true" /></div>
        <strong>{totalItems}</strong><small>Status: {deliveryFilterLabel(status)}</small>
      </article>
      <article className="metric-card accent-green">
        <div className="metric-card-title"><span>API Telegram menerima</span><PackageCheck aria-hidden="true" /></div>
        <strong>{sentCount}</strong><small>Belum tentu dikonfirmasi pembeli</small>
      </article>
      <article className="metric-card accent-red">
        <div className="metric-card-title"><span>Review teknis</span><ShieldAlert aria-hidden="true" /></div>
        <strong>{attentionCount}</strong><small>Receipt gagal pasti atau hasil ambigu</small>
        {attentionCount > 0 ? <Link href={deliveriesHref({ productId, search, status: "ATTENTION" })} prefetch={false}>Lihat receipt bermasalah</Link> : null}
      </article>
      <article className="metric-card accent-yellow">
        <div className="metric-card-title"><span>Laporan pembeli aktif</span><ShieldAlert aria-hidden="true" /></div>
        <strong>{reportedOrderCount}</strong><small>{reportedDeliveryRowCount} file terkait</small>
        {reportedOrderCount > 0 ? <Link href={deliveriesHref({ productId, search, status: "REPORTED" })} prefetch={false}>Lihat laporan pembeli</Link> : null}
      </article>
      <article className="metric-card accent-ink">
        <div className="metric-card-title"><span>Total ledger</span><Send aria-hidden="true" /></div>
        <strong>{totalDeliveryCount}</strong><small>Seluruh receipt yang pernah dibuat</small>
      </article>
    </section>
  );
}

export function DeliveryLedger({
  deliveries,
  notificationKind,
  notificationPagination,
  notificationSearch,
  notificationStatus,
  pagination,
  productId,
  products,
  search,
  status,
}: Pick<AdminDeliveriesData, "deliveries" | "notificationKind" | "notificationPagination" | "notificationSearch" | "notificationStatus" | "pagination" | "productId" | "products" | "search" | "status">) {
  const hasRetryableDelivery = deliveries.some((delivery) => delivery.channel === "TELEGRAM" && delivery.status === "FAILED");
  const resetParams = new URLSearchParams();
  if (notificationSearch) resetParams.set("notifyQ", notificationSearch);
  if (notificationKind) resetParams.set("notifyKind", notificationKind);
  if (notificationStatus) resetParams.set("notifyStatus", notificationStatus);
  if (notificationPagination.page > 1) {
    resetParams.set("notifyPage", String(notificationPagination.page));
  }
  const deliveryResetHref = `/admin/deliveries${resetParams.size ? `?${resetParams}` : ""}#delivery-ledger`;
  return (
    <section className="panel wide-panel" id="delivery-ledger">
      <div className="panel-heading">
        <div><p className="eyebrow">Delivery ledger</p><h2>Produk terkirim ke pembeli</h2></div>
        <form action="/admin/deliveries#delivery-ledger" className="admin-search-form admin-filter-form" method="get">
          {notificationSearch ? <input name="notifyQ" type="hidden" value={notificationSearch} /> : null}
          {notificationKind ? <input name="notifyKind" type="hidden" value={notificationKind} /> : null}
          {notificationStatus ? <input name="notifyStatus" type="hidden" value={notificationStatus} /> : null}
          {notificationPagination.page > 1 ? <input name="notifyPage" type="hidden" value={notificationPagination.page} /> : null}
          <label className="visually-hidden" htmlFor="delivery-search">Cari pengiriman</label>
          <input defaultValue={search} id="delivery-search" name="q" placeholder="Cari @username, invoice, produk..." type="search" />
          <label className="visually-hidden" htmlFor="delivery-product">Filter produk</label>
          <select defaultValue={productId} id="delivery-product" name="product"><option value="">Semua produk</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select>
          <label className="visually-hidden" htmlFor="delivery-status">Filter status</label>
          <select defaultValue={status} id="delivery-status" name="status">
            <option value="">Semua status</option><option value="READY">Siap diambil lewat website</option><option value="SENT">Sudah dikirim / diambil</option><option value="SENDING">Sedang dikirim</option><option value="ATTENTION">Semua yang perlu review</option><option value="REPORTED">Dilaporkan tidak terlihat pembeli</option><option value="UNKNOWN">Hasil Telegram ambigu</option><option value="FAILED">Gagal pasti</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
          {search || productId || status ? <Link className="button button-small button-ghost" href={deliveryResetHref} prefetch={false}>Reset</Link> : null}
        </form>
      </div>

      {hasRetryableDelivery ? (
        <div className="inventory-edit-toolbar">
          <span className="muted">Centang maksimal 25 kiriman gagal yang ingin dicoba ulang.</span>
          <AdminConfirmSubmitButton className="button button-primary button-small" confirmText="Retry yang terpilih" description="Sistem tetap melewati order refund, delivery ambigu, dan stok yang alokasinya sudah berubah." formId="bulk-delivery-retry" title="Coba ulang pengiriman terpilih?">Retry terpilih</AdminConfirmSubmitButton>
        </div>
      ) : null}

      {deliveries.length === 0 ? (
        <EmptyState><strong>Belum ada pengiriman yang cocok.</strong></EmptyState>
      ) : (
        <form action="/api/admin/deliveries/retry" id="bulk-delivery-retry" method="post">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Pilih</th><th>Produk / file</th><th>Penerima</th><th>Invoice</th><th>Delivery</th><th>Status pembeli</th><th>Waktu</th><th>Detail</th></tr></thead>
              <tbody>
                {deliveries.map((delivery) => {
                  const feedback = deliveryFeedbackState(delivery.order.notifications);
                  return (
                    <tr key={delivery.id}>
                      <td>{delivery.channel === "TELEGRAM" && delivery.status === "FAILED" ? <input aria-label={`Pilih ${delivery.order.invoiceNumber}`} name="deliveryIds" type="checkbox" value={delivery.id} /> : <span className="muted">-</span>}</td>
                      <td><strong>{delivery.stockItem.product.name}</strong><small>{maskInventoryFilename(delivery.stockItem.originalFilename)}</small></td>
                      <td><strong>{buyerLabel(delivery.order)}</strong><small>{delivery.channel === "WEB" ? "Website" : `Chat ${delivery.chatId}`}</small></td>
                      <td>{delivery.order.invoiceNumber}</td>
                      <td><span className={`status-pill ${delivery.status === "SENT" || delivery.status === "READY" ? "status-good" : delivery.status === "FAILED" ? "status-bad" : "status-warn"}`}>{deliveryStatusLabel(delivery.status)}</span></td>
                      <td>{delivery.channel === "WEB" ? <span className="status-pill status-neutral">Download {delivery.downloadCount}x</span> : <span className={`status-pill ${feedback.missingReported ? "status-bad" : feedback.acknowledged ? "status-good" : "status-neutral"}`}>{feedback.missingReported ? "Dilaporkan tidak terlihat" : feedback.acknowledged ? "Dikonfirmasi diterima" : "Belum ada konfirmasi"}</span>}</td>
                      <td>{dateLabel(delivery.sentAt)}</td>
                      <td><Link className="button button-small" href={`/admin/deliveries/${delivery.id}`} prefetch={false}>Lihat kiriman</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}
      <AdminPagination
        ariaLabel="Pagination tracking pengiriman"
        basePath="/admin/deliveries"
        currentPage={pagination.page}
        fragment="delivery-ledger"
        itemLabel="pengiriman"
        pageSize={pagination.pageSize}
        query={{
          notifyKind: notificationKind || undefined,
          notifyPage: notificationPagination.page > 1 ? String(notificationPagination.page) : undefined,
          notifyQ: notificationSearch || undefined,
          notifyStatus: notificationStatus || undefined,
          product: productId || undefined,
          q: search || undefined,
          status: status || undefined,
        }}
        totalItems={pagination.totalItems}
      />
    </section>
  );
}
