import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { EmptyState } from "@/components/admin/empty-state";
import type { AdminDeliveriesData } from "@/server/admin/deliveries";

function dateLabel(value: Date) {
  return value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function notificationStatusLabel(status: string) {
  return status === "MANUAL_REVIEW" ? "Perlu review manual" : "Gagal";
}

function buyerLabel(notification: AdminDeliveriesData["notificationIssues"][number]) {
  if (notification.order?.buyerUsername) return `@${notification.order.buyerUsername}`;
  return notification.order?.buyerDisplayName ?? `Chat ${notification.chatId}`;
}

function boundedError(value: string | null) {
  if (!value) return "Tidak ada detail error.";
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function resetHref(data: Pick<AdminDeliveriesData, "pagination" | "productId" | "search" | "status">) {
  const params = new URLSearchParams();
  if (data.search) params.set("q", data.search);
  if (data.productId) params.set("product", data.productId);
  if (data.status) params.set("status", data.status);
  if (data.pagination.page > 1) params.set("page", String(data.pagination.page));
  const query = params.toString();
  return `/admin/deliveries${query ? `?${query}` : ""}#notification-ledger`;
}

export function NotificationIssueLedger({
  notificationIssueKinds,
  notificationIssues,
  notificationKind,
  notificationPagination,
  notificationSearch,
  notificationStatus,
  pagination,
  productId,
  search,
  status,
}: Pick<
  AdminDeliveriesData,
  | "notificationIssueKinds"
  | "notificationIssues"
  | "notificationKind"
  | "notificationPagination"
  | "notificationSearch"
  | "notificationStatus"
  | "pagination"
  | "productId"
  | "search"
  | "status"
>) {
  return (
    <section className="panel wide-panel" id="notification-ledger">
      <div className="panel-heading">
        <div className="panel-heading-title">
          <span className="panel-heading-icon"><AlertTriangle aria-hidden="true" /></span>
          <div>
            <p className="eyebrow">Notification diagnostics</p>
            <h2>Notifikasi gagal dan perlu review</h2>
            <p className="muted">
              Pantau panduan pembeli, lampiran, broadcast, OTP, refund, dan pesan operasional tanpa menampilkan isi privatnya.
            </p>
          </div>
        </div>
        <form action="/admin/deliveries#notification-ledger" className="admin-search-form admin-filter-form" method="get">
          {search ? <input name="q" type="hidden" value={search} /> : null}
          {productId ? <input name="product" type="hidden" value={productId} /> : null}
          {status ? <input name="status" type="hidden" value={status} /> : null}
          {pagination.page > 1 ? <input name="page" type="hidden" value={pagination.page} /> : null}
          <label className="visually-hidden" htmlFor="notification-issue-search">Cari masalah notifikasi</label>
          <input
            defaultValue={notificationSearch}
            id="notification-issue-search"
            name="notifyQ"
            placeholder="Cari invoice, user, chat ID, jenis, atau error..."
            type="search"
          />
          <label className="visually-hidden" htmlFor="notification-issue-kind">Filter jenis notifikasi</label>
          <select defaultValue={notificationKind} id="notification-issue-kind" name="notifyKind">
            <option value="">Semua jenis</option>
            {notificationIssueKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <label className="visually-hidden" htmlFor="notification-issue-status">Filter status notifikasi</label>
          <select defaultValue={notificationStatus} id="notification-issue-status" name="notifyStatus">
            <option value="">Gagal + perlu review</option>
            <option value="MANUAL_REVIEW">Perlu review manual</option>
            <option value="FAILED">Gagal pasti</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
          {notificationSearch || notificationKind || notificationStatus ? (
            <Link className="button button-small button-ghost" href={resetHref({ pagination, productId, search, status })} prefetch={false}>Reset</Link>
          ) : null}
        </form>
      </div>

      <p className="alert alert-warning">
        Baris `MANUAL_REVIEW` tidak boleh dikirim ulang secara buta. Buka order untuk memeriksa urutan file, lampiran, dan panduan sebelum melakukan recovery.
      </p>

      {notificationIssues.length === 0 ? (
        <EmptyState><strong>Tidak ada masalah notifikasi yang cocok.</strong></EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Jenis</th><th>Order & pembeli</th><th>Status</th><th>Percobaan</th><th>Error terakhir</th><th>Dibuat</th><th>Detail</th></tr>
            </thead>
            <tbody>
              {notificationIssues.map((notification) => (
                <tr key={notification.id}>
                  <td><strong>{notification.kind}</strong><small>ID {notification.id.slice(-8)}</small></td>
                  <td>
                    <strong>{notification.order?.invoiceNumber ?? "Tanpa order"}</strong>
                    <small>{buyerLabel(notification)} · Chat {notification.chatId}</small>
                  </td>
                  <td>
                    <span className={`status-pill ${notification.status === "MANUAL_REVIEW" ? "status-warn" : "status-bad"}`}>
                      {notificationStatusLabel(notification.status)}
                    </span>
                  </td>
                  <td>{notification.attempts}</td>
                  <td><span className="notification-error-text">{boundedError(notification.lastError)}</span></td>
                  <td>{dateLabel(notification.createdAt)}</td>
                  <td>
                    {notification.orderId ? (
                      <Link className="button button-small" href={`/admin/orders/${notification.orderId}?notifyStatus=${notification.status}#notification-history`} prefetch={false}>
                        Buka order
                      </Link>
                    ) : <span className="muted">Tidak ada detail order</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminPagination
        ariaLabel="Pagination masalah notifikasi"
        basePath="/admin/deliveries"
        currentPage={notificationPagination.page}
        fragment="notification-ledger"
        itemLabel="notifikasi bermasalah"
        pageParam="notifyPage"
        pageSize={notificationPagination.pageSize}
        query={{
          notifyKind: notificationKind || undefined,
          notifyQ: notificationSearch || undefined,
          notifyStatus: notificationStatus || undefined,
          page: pagination.page > 1 ? String(pagination.page) : undefined,
          product: productId || undefined,
          q: search || undefined,
          status: status || undefined,
        }}
        totalItems={notificationPagination.totalItems}
      />
    </section>
  );
}
