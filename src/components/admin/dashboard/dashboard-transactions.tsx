import Link from "next/link";
import { ReceiptText, Search, WalletCards } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { EmptyState } from "@/components/admin/empty-state";
import { PanelHeading } from "@/components/admin/panel-heading";
import type { AdminDashboardData } from "@/server/admin/dashboard";
import {
  adminWalletTopupProviderLabel,
  walletTopupPresentation,
} from "@/server/admin/wallet-topups";
import { buyerLabel } from "@/server/orders/buyer";
import { formatRupiah } from "@/server/utils/format";
import { AdminOrderPaymentAction } from "@/components/admin/admin-order-payment-action";
import { AdminWalletTopupAction } from "@/components/admin/admin-wallet-topup-action";
import { buildAdminReturnPath } from "@/server/admin/return-path";

type DashboardTransactionsProps = Pick<
  AdminDashboardData,
  | "activeSheet"
  | "now"
  | "orderPagination"
  | "orders"
  | "query"
  | "search"
  | "topupFilter"
  | "topupSearch"
  | "walletTopupPagination"
  | "walletTopups"
>;

export function dashboardTransactionHref({
  orderPage,
  orderSearch,
  sheet,
  topupPage,
  topupSearch,
  topupStatus,
}: {
  orderPage?: number;
  orderSearch?: string;
  sheet: "orders" | "topups";
  topupPage?: number;
  topupSearch?: string;
  topupStatus?: string;
}) {
  return buildAdminReturnPath({
    pathname: "/admin",
    query: {
      page: orderPage && orderPage > 1 ? orderPage : undefined,
      q: orderSearch || undefined,
      sheet,
      topupPage: topupPage && topupPage > 1 ? topupPage : undefined,
      topupQ: topupSearch || undefined,
      topupStatus: topupStatus && topupStatus !== "all" ? topupStatus : undefined,
    },
    fragment: sheet === "topups" ? "wallet-topups" : "recent-orders",
  });
}

function dashboardHref(
  props: DashboardTransactionsProps,
  sheet: "orders" | "topups",
  overrides: {
    orderSearch?: string;
    topupSearch?: string;
    topupStatus?: string;
    resetOrderPage?: boolean;
    resetTopupPage?: boolean;
  } = {},
) {
  return dashboardTransactionHref({
    orderPage: overrides.resetOrderPage ? 1 : props.orderPagination.page,
    orderSearch: overrides.orderSearch ?? props.search,
    sheet,
    topupPage: overrides.resetTopupPage ? 1 : props.walletTopupPagination.page,
    topupSearch: overrides.topupSearch ?? props.topupSearch,
    topupStatus: overrides.topupStatus ?? props.topupFilter,
  });
}

export function DashboardTransactionTabs(props: DashboardTransactionsProps) {
  const { activeSheet } = props;
  return (
    <nav aria-label="Sheet transaksi dashboard" className="admin-sheet-tabs">
      <Link aria-current={activeSheet === "orders" ? "page" : undefined} className={activeSheet === "orders" ? "is-active" : ""} href={dashboardHref(props, "orders")} prefetch={false} scroll={false}>
        <ReceiptText aria-hidden="true" size={17} /> Order terbaru
      </Link>
      <Link aria-current={activeSheet === "topups" ? "page" : undefined} className={activeSheet === "topups" ? "is-active" : ""} href={dashboardHref(props, "topups")} prefetch={false} scroll={false}>
        <WalletCards aria-hidden="true" size={17} /> Top up wallet
      </Link>
    </nav>
  );
}

export function DashboardTransactions(props: DashboardTransactionsProps) {
  return props.activeSheet === "topups"
    ? <WalletTopupTable {...props} />
    : <RecentOrderTable {...props} />;
}

function WalletTopupTable(props: DashboardTransactionsProps) {
  const {
    now,
    search,
    topupFilter,
    topupSearch,
    walletTopupPagination,
    walletTopups,
  } = props;
  const returnTo = dashboardHref(props, "topups");
  return (
    <section className="panel wide-panel" id="wallet-topups">
      <PanelHeading
        eyebrow="Wallet payment rail"
        icon={<WalletCards aria-hidden="true" />}
        title="Transaksi top up wallet"
        trailing={
          <form action="/admin#wallet-topups" className="admin-search-form" method="get">
            <input name="sheet" type="hidden" value="topups" />
            {search ? <input name="q" type="hidden" value={search} /> : null}
            {props.orderPagination.page > 1 ? <input name="page" type="hidden" value={props.orderPagination.page} /> : null}
            <label className="visually-hidden" htmlFor="dashboard-topup-search">Cari top up wallet</label>
            <input defaultValue={topupSearch} id="dashboard-topup-search" name="topupQ" placeholder="Cari invoice, @username, chat ID..." type="search" />
            <select defaultValue={topupFilter} name="topupStatus">
              <option value="all">Semua status</option>
              <option value="problem">Bermasalah</option>
              <option value="pending">Menunggu</option>
              <option value="paid">Berhasil</option>
            </select>
            <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
            {topupSearch || topupFilter !== "all" ? <Link className="button button-small button-ghost" href={dashboardHref(props, "topups", { resetTopupPage: true, topupSearch: "", topupStatus: "all" })} prefetch={false} scroll={false}>Reset</Link> : null}
          </form>
        }
      />
      {walletTopups.length === 0 ? (
        <EmptyState><strong>{topupSearch || topupFilter !== "all" ? "Top up tidak ditemukan." : "Belum ada transaksi top up."}</strong></EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice</th><th>User</th><th>Metode</th><th>Saldo</th><th>Total bayar</th><th>Status</th><th>Deteksi terakhir</th><th>Dibuat</th><th>Aksi</th><th>Detail</th></tr></thead>
            <tbody>
              {walletTopups.map((topup) => {
                const lastEvent = topup.bridgeEvents[0];
                const presentation = walletTopupPresentation({
                  status: topup.status,
                  expiresAt: topup.expiresAt,
                  verifiedBy: topup.verifiedBy,
                  bridgeClaimStatus: topup.bridgeClaim?.status,
                  bridgeClaimError: topup.bridgeClaim?.lastError,
                  eventStatus: lastEvent?.status,
                  eventReason: lastEvent?.reason,
                  now,
                });
                return (
                  <tr key={topup.id}>
                    <td><strong>{topup.invoiceNumber}</strong><small>Kode Rp{topup.uniqueCode}</small></td>
                    <td><Link href={`/admin/wallet/${encodeURIComponent(topup.chatId)}`} prefetch={false}>{topup.wallet.buyerUsername ? `@${topup.wallet.buyerUsername}` : topup.wallet.buyerDisplayName ?? topup.chatId}</Link><small>{topup.chatId}</small></td>
                    <td><span className="status-pill status-neutral">{adminWalletTopupProviderLabel({
                      paymentMethod: topup.paymentMethod,
                      qrisProviderKey: topup.qrisInvoiceAttempt?.providerKeySnapshot,
                    })}</span></td>
                    <td>{formatRupiah(topup.baseAmount)}</td>
                    <td><strong>{formatRupiah(topup.billedAmount)}</strong></td>
                    <td><span className={`status-pill status-${presentation.tone}`}>{presentation.label}</span></td>
                    <td><small>{presentation.detail}</small></td>
                    <td>{topup.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                    <td>
                      <AdminWalletTopupAction
                        now={now}
                        returnTo={returnTo}
                        topup={topup}
                      />
                    </td>
                    <td><Link className="button button-small" href={`/admin/wallet/${encodeURIComponent(topup.chatId)}`} prefetch={false}>Buka user</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination transaksi top up dashboard"
        basePath="/admin"
        currentPage={walletTopupPagination.page}
        itemLabel="top up"
        pageParam="topupPage"
        pageSize={walletTopupPagination.pageSize}
        fragment="wallet-topups"
        query={{ q: search || undefined, page: props.orderPagination.page > 1 ? String(props.orderPagination.page) : undefined, topupQ: topupSearch || undefined, topupStatus: topupFilter === "all" ? undefined : topupFilter, sheet: "topups" }}
        totalItems={walletTopupPagination.totalItems}
      />
    </section>
  );
}

function RecentOrderTable(props: DashboardTransactionsProps) {
  const {
    now,
    orderPagination,
    orders,
    search,
    topupFilter,
    topupSearch,
  } = props;
  const returnTo = dashboardHref(props, "orders");
  return (
    <section className="panel wide-panel" id="recent-orders">
      <PanelHeading
        eyebrow="Order rail"
        icon={<ReceiptText aria-hidden="true" />}
        title="Order terbaru"
        trailing={
          <form action="/admin#recent-orders" className="admin-search-form" method="get">
            <input name="sheet" type="hidden" value="orders" />
            {topupSearch ? <input name="topupQ" type="hidden" value={topupSearch} /> : null}
            {topupFilter !== "all" ? <input name="topupStatus" type="hidden" value={topupFilter} /> : null}
            {props.walletTopupPagination.page > 1 ? <input name="topupPage" type="hidden" value={props.walletTopupPagination.page} /> : null}
            <label className="visually-hidden" htmlFor="dashboard-order-search">Cari username atau order</label>
            <input defaultValue={search} id="dashboard-order-search" name="q" placeholder="Cari @username, invoice, produk..." type="search" />
            <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Cari</button>
            {search ? <Link className="button button-small button-ghost" href={dashboardHref(props, "orders", { orderSearch: "", resetOrderPage: true })} prefetch={false} scroll={false}>Reset</Link> : null}
          </form>
        }
      />
      {orders.length === 0 ? (
        <EmptyState><strong>{search ? "Order tidak ditemukan." : "Belum ada order."}</strong></EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice</th><th>Pembeli</th><th>Total</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><Link href={`/admin/orders/${order.id}`} prefetch={false}><strong>{order.invoiceNumber}</strong></Link></td>
                  <td>{buyerLabel(order)}</td>
                  <td>{formatRupiah(order.grandTotal)}</td>
                  <td>{order.status}</td>
                  <td>{order.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                  <td>
                    <AdminOrderPaymentAction
                      now={now}
                      order={order}
                      returnTo={returnTo}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination history dashboard"
        basePath="/admin"
        currentPage={orderPagination.page}
        itemLabel="order"
        pageSize={orderPagination.pageSize}
        fragment="recent-orders"
        query={{ q: search || undefined, topupPage: props.walletTopupPagination.page > 1 ? String(props.walletTopupPagination.page) : undefined, topupQ: topupSearch || undefined, topupStatus: topupFilter === "all" ? undefined : topupFilter, sheet: "orders" }}
        totalItems={orderPagination.totalItems}
      />
    </section>
  );
}
