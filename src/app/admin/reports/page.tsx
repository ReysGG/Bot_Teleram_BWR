import Link from "next/link";
import {
  Banknote,
  ChartNoAxesCombined,
  MessageSquareText,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  WalletCards,
} from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getSalesReport, parseSalesReportRange } from "@/server/admin/sales-report";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";

export const dynamic = "force-dynamic";

function statusLabel(value: string) {
  return value.replaceAll("_", " ").toLocaleLowerCase("id-ID");
}

export default async function SalesReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const days = parseSalesReportRange(query.range);
  const [counts, report] = await Promise.all([
    getAdminInventoryCounts(),
    getSalesReport(days),
  ]);
  const maxDailyRevenue = Math.max(1, ...report.daily.map((item) => item.revenue));

  return (
    <AdminShell
      active="reports"
      counts={counts}
      description="Laporan penjualan produk digital, SMS OTP, arus top up, refund, dan performa harian."
      email={admin.email}
      eyebrow="Sales intelligence"
      title="Laporan penjualan"
    >
      <nav aria-label="Rentang laporan" className="report-range-tabs">
        {[7, 30, 90].map((range) => (
          <Link className={days === range ? "is-active" : ""} href={`/admin/reports?range=${range}`} prefetch={false} key={range}>
            {range} hari
          </Link>
        ))}
      </nav>

      <section className="metric-grid report-metrics">
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>Total penjualan</span><Banknote aria-hidden="true" /></div>
          <strong>{formatRupiah(report.grossSales)}</strong>
          <small>Produk + SMS OTP</small>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Order produk</span><ReceiptText aria-hidden="true" /></div>
          <strong>{report.productOrders}</strong>
          <small>Rata-rata {formatRupiah(report.averageOrderValue)}</small>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Unit produk</span><PackageCheck aria-hidden="true" /></div>
          <strong>{report.productUnits}</strong>
          <small>{formatRupiah(report.productRevenue)} omzet produk</small>
        </article>
        <article className="metric-card accent-ink">
          <div className="metric-card-title"><span>SMS OTP</span><MessageSquareText aria-hidden="true" /></div>
          <strong>{report.smsOrders}</strong>
          <small>{formatRupiah(report.smsRevenue)} penjualan</small>
        </article>
        <article className="metric-card accent-red">
          <div className="metric-card-title"><span>Refund wallet</span><RotateCcw aria-hidden="true" /></div>
          <strong>{formatRupiah(report.refunds)}</strong>
          <small>{report.refundCount} transaksi refund</small>
        </article>
      </section>

      <section className="panel report-chart-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><ChartNoAxesCombined aria-hidden="true" /></span>
            <div><p className="eyebrow">Daily rail</p><h2>Penjualan produk per hari</h2></div>
          </div>
          <strong>{formatRupiah(report.productRevenue)}</strong>
        </div>
        <div className="sales-chart" role="img" aria-label={`Grafik penjualan ${days} hari terakhir`}>
          {report.daily.map((item) => (
            <div className="sales-chart-column" key={item.key} title={`${item.key}: ${formatRupiah(item.revenue)} · ${item.orders} order`}>
              <span>{item.revenue > 0 ? formatRupiah(item.revenue) : ""}</span>
              <div style={{ height: `${Math.max(item.revenue > 0 ? 8 : 2, (item.revenue / maxDailyRevenue) * 100)}%` }} />
              <small>{item.date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "Asia/Jakarta" })}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid report-grid">
        <article className="panel">
          <div className="panel-heading">
            <div className="panel-heading-title">
              <span className="panel-heading-icon"><PackageCheck aria-hidden="true" /></span>
              <div><p className="eyebrow">Product ranking</p><h2>Produk terlaris</h2></div>
            </div>
          </div>
          {report.topProducts.length === 0 ? <div className="empty-state"><strong>Belum ada penjualan.</strong></div> : (
            <div className="table-wrap">
              <table className="report-table">
                <thead><tr><th>Produk</th><th>Unit</th><th>Omzet</th></tr></thead>
                <tbody>{report.topProducts.map((product) => (
                  <tr key={product.name}><td><strong>{product.name}</strong></td><td>{product.units}</td><td>{formatRupiah(product.revenue)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </article>

        <article className="panel">
          <div className="panel-heading">
            <div className="panel-heading-title">
              <span className="panel-heading-icon"><WalletCards aria-hidden="true" /></span>
              <div><p className="eyebrow">Cashflow</p><h2>Wallet & status</h2></div>
            </div>
          </div>
          <div className="report-cashflow">
            <div><span>Top up berhasil</span><strong>{formatRupiah(report.paidTopups)}</strong><small>{report.paidTopupCount} transaksi</small></div>
            <div><span>Refund wallet</span><strong>{formatRupiah(report.refunds)}</strong><small>{report.refundCount} transaksi</small></div>
          </div>
          <div className="report-status-list">
            {report.orderStatuses.map((item) => <div key={item.status}><span>{statusLabel(item.status)}</span><strong>{item.count}</strong></div>)}
            {report.smsStatuses.map((item) => <div key={`sms-${item.status}`}><span>SMS {statusLabel(item.status)}</span><strong>{item.count}</strong></div>)}
          </div>
        </article>
      </section>
    </AdminShell>
  );
}
