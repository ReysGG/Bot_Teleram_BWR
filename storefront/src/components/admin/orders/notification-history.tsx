import Link from "next/link";
import { AdminPagination } from "@/components/admin/admin-pagination";
import {
  notificationStatusLabel,
  orderDetailDateLabel,
} from "@/components/admin/orders/labels";
import { notificationFilterStatuses } from "@/server/admin/status-filter";
import type {
  AdminOrderDetailQuery,
  AdminOrderDetailView,
} from "@/server/admin/orders/detail";

type NotificationHistoryProps = Pick<
  AdminOrderDetailView,
  "order" | "notifications" | "notificationStatus" | "notificationPagination"
> & { query: AdminOrderDetailQuery };

export function NotificationHistory({
  order,
  notifications,
  notificationStatus,
  notificationPagination,
  query,
}: NotificationHistoryProps) {
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Telegram outbox</p>
          <h2>Riwayat notifikasi</h2>
        </div>
        <form action={`/admin/orders/${order.id}`} className="admin-search-form admin-filter-form" method="get">
          {query.stockPage ? <input name="stockPage" type="hidden" value={query.stockPage} /> : null}
          <label className="visually-hidden" htmlFor="order-notification-status">Filter status notifikasi</label>
          <select defaultValue={notificationStatus} id="order-notification-status" name="notifyStatus">
            <option value="">Semua status</option>
            {notificationFilterStatuses.map((status) => (
              <option key={status} value={status}>{notificationStatusLabel(status)}</option>
            ))}
          </select>
          <button className="button button-small" type="submit">Terapkan</button>
          {notificationStatus ? (
            <Link className="button button-small button-ghost" href={`/admin/orders/${order.id}`} prefetch={false}>Reset</Link>
          ) : null}
        </form>
      </div>
      {notifications.length === 0 ? (
        <div className="empty-state"><strong>Tidak ada notifikasi dengan status ini.</strong></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Jenis</th><th>Pesan</th><th>Status</th><th>Percobaan</th><th>Dikirim</th><th>Error</th></tr>
            </thead>
            <tbody>
              {notifications.map((notification) => (
                <tr key={notification.id}>
                  <td>{notification.kind}</td>
                  <td>{notification.messageText ?? "-"}</td>
                  <td>
                    <span className={`status-pill ${notification.status === "SENT" ? "status-good" : notification.status === "FAILED" || notification.status === "MANUAL_REVIEW" ? "status-warn" : "status-neutral"}`}>
                      {notificationStatusLabel(notification.status)}
                    </span>
                  </td>
                  <td>{notification.attempts}</td>
                  <td>{orderDetailDateLabel(notification.sentAt)}</td>
                  <td>{notification.lastError ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination notifikasi order"
        basePath={`/admin/orders/${order.id}`}
        currentPage={notificationPagination.page}
        itemLabel="notifikasi"
        pageParam="notifyPage"
        pageSize={notificationPagination.pageSize}
        query={{
          notifyStatus: notificationStatus || undefined,
          stockPage: query.stockPage,
        }}
        totalItems={notificationPagination.totalItems}
      />
    </section>
  );
}
