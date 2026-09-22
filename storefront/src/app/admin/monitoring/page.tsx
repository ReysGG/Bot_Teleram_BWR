import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Clock3,
  CreditCard,
  FileWarning,
  RefreshCcw,
  Server,
  ShieldAlert,
} from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryAutoRefresh } from "@/components/admin/inventory-auto-refresh";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { loadStoreHealthSnapshot } from "@/server/monitoring/store-health";
import { getBinanceWebErrorRateSnapshot } from "@/server/payment/binance-web-metrics";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value
    ? value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "Belum pernah";
}

function tone(severity: "healthy" | "warning" | "critical"): string {
  if (severity === "critical") return "status-bad";
  if (severity === "warning") return "status-warn";
  return "status-good";
}

export default async function MonitoringPage() {
  const admin = await requireAdminPage();
  const [counts, snapshot, binanceWeb] = await Promise.all([
    getAdminInventoryCounts(),
    loadStoreHealthSnapshot(),
    getBinanceWebErrorRateSnapshot(),
  ]);
  const { metrics } = snapshot;

  return (
    <AdminShell
      active="monitoring"
      counts={counts}
      description="Status bridge, worker, pengiriman, stok, dan event pembayaran dalam satu layar. Refresh otomatis setiap 30 detik."
      email={admin.email}
      eyebrow="Operations"
      title="Monitoring sistem"
    >
      <InventoryAutoRefresh autoCheckEnabled intervalSeconds={30} />

      <section className="metric-grid">
        <div className="metric-card accent-orange">
          <div className="metric-card-title"><span>Status sistem</span><Activity aria-hidden="true" /></div>
          <strong>{snapshot.severity === "healthy" ? "OK" : snapshot.severity === "warning" ? "WARN" : "ALERT"}</strong>
        </div>
        <div className="metric-card accent-green">
          <div className="metric-card-title"><span>Bridge queue</span><Server aria-hidden="true" /></div>
          <strong>{metrics.bridgeQueueSize}</strong>
        </div>
        <div className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Outbox pending</span><BellRing aria-hidden="true" /></div>
          <strong>{metrics.pendingNotifications}</strong>
        </div>
        <div className="metric-card accent-red">
          <div className="metric-card-title"><span>Review manual</span><ShieldAlert aria-hidden="true" /></div>
          <strong>{metrics.manualReviewNotifications + metrics.unknownDeliveries}</strong>
        </div>
        <div className="metric-card accent-ink">
          <div className="metric-card-title"><span>Event ditolak / 1 jam</span><CreditCard aria-hidden="true" /></div>
          <strong>{metrics.rejectedPaymentEventsLastHour}</strong>
        </div>
      </section>

      <section className="panel wide-panel" id="bridge">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><Server aria-hidden="true" /></span>
            <div><p className="eyebrow">Payment transport</p><h2>DANA Bridge</h2></div>
          </div>
          <span className={`status-pill ${tone(snapshot.severity === "critical" && !metrics.bridgeLastSeenAt ? "critical" : metrics.bridgeQueueSize > 0 ? "warning" : "healthy")}`}>
            {metrics.bridgeLastSeenAt ? "Heartbeat terdeteksi" : "Belum terhubung"}
          </span>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th>Heartbeat terakhir</th><td>{formatDate(metrics.bridgeLastSeenAt)}</td></tr>
              <tr><th>Versi aplikasi</th><td>{metrics.bridgeAppVersion ?? "Versi lama / belum dilaporkan"}</td></tr>
              <tr><th>Status notification listener</th><td>{metrics.bridgeListenerConnected === null ? "Belum dilaporkan" : metrics.bridgeListenerConnected ? "Terhubung" : "Terputus"}</td></tr>
              <tr><th>Event pending / ditahan</th><td>{metrics.bridgePendingQueueSize} / {metrics.bridgeBlockedQueueSize}</td></tr>
              <tr><th>Event tertua</th><td>{formatDate(metrics.bridgeOldestQueuedAt)}</td></tr>
              <tr><th>Percobaan tertinggi</th><td>{metrics.bridgeHighestAttemptCount}</td></tr>
              <tr><th>Kode error terakhir</th><td>{metrics.bridgeLastErrorCode ?? "-"}</td></tr>
              <tr><th>Event pembayaran ditolak (1 jam)</th><td>{metrics.rejectedPaymentEventsLastHour}</td></tr>
            </tbody>
          </table>
        </div>
        <p className="fine-print">Event dengan nominal/waktu/claim ambigu tetap ditahan untuk review; sistem tidak mengkredit saldo secara otomatis.</p>
      </section>

      <section className="panel wide-panel" id="workers">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><BellRing aria-hidden="true" /></span>
            <div><p className="eyebrow">Workers & delivery</p><h2>Antrean operasi</h2></div>
          </div>
          <Link className="button button-small" href="/admin/deliveries" prefetch={false}><RefreshCcw aria-hidden="true" size={16} /> Buka tracking</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Komponen</th><th>Jumlah</th><th>Catatan</th><th>Aksi</th></tr></thead>
            <tbody>
              <tr><td>Notifikasi pending</td><td><strong>{metrics.pendingNotifications}</strong></td><td>{formatDate(metrics.oldestPendingNotificationAt)} item tertua</td><td><Link href="/admin/deliveries" prefetch={false}>Outbox</Link></td></tr>
              <tr><td>Notifikasi gagal</td><td><strong>{metrics.failedNotifications}</strong></td><td>Sudah melewati percobaan retry</td><td><Link href="/admin/deliveries" prefetch={false}>Periksa</Link></td></tr>
              <tr><td>Delivery gagal</td><td><strong>{metrics.failedDeliveries}</strong></td><td>Refund hanya untuk kegagalan pasti</td><td><Link href="/admin/deliveries?status=FAILED" prefetch={false}>Periksa</Link></td></tr>
              <tr><td>Delivery ambigu</td><td><strong>{metrics.unknownDeliveries}</strong></td><td>Telegram mungkin sudah menerima file</td><td><Link href="/admin/deliveries?status=UNKNOWN" prefetch={false}>Review</Link></td></tr>
              <tr><td>Order/top up expired belum diproses</td><td><strong>{metrics.expiredPendingOrders + metrics.expiredPendingTopups}</strong></td><td>Worker expiry perlu dipantau</td><td><Link href="/admin/payments/reconciliation" prefetch={false}>Rekonsiliasi</Link></td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wide-panel" id="binance-web">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><CreditCard aria-hidden="true" /></span>
            <div><p className="eyebrow">Payment verifier</p><h2>Binance web-session error rate</h2></div>
          </div>
          <Link className="button button-small" href="/admin/payment-settings/binance-web" prefetch={false}>Buka session</Link>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Window</th><th>Poll</th><th>Sukses</th><th>Gagal</th><th>Error rate</th><th>Auth</th><th>Challenge</th><th>Contract/account</th></tr></thead>
            <tbody>
              {([
                ["1 jam", binanceWeb.lastHour],
                ["24 jam", binanceWeb.last24Hours],
              ] as const).map(([label, metric]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td><strong>{metric.runs}</strong></td>
                  <td>{metric.successfulRuns}</td>
                  <td>{metric.failedRuns}</td>
                  <td><span className={`status-pill ${metric.runs === 0 ? "status-neutral" : metric.errorRatePercent >= 25 ? "status-bad" : metric.errorRatePercent >= 5 ? "status-warn" : "status-good"}`}>{metric.runs === 0 ? "Belum ada data" : `${metric.errorRatePercent.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}</span></td>
                  <td>{metric.unauthorized}</td>
                  <td>{metric.challenged + metric.rateLimited}</td>
                  <td>{metric.contractUnknown + metric.accountMismatch + metric.identityUnproven + metric.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="fine-print">Metrik memakai bucket lima menit dan tidak menyimpan cookie, Order ID, transaction ID, nama pembayar, atau payload Binance.</p>
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><AlertTriangle aria-hidden="true" /></span>
            <div><p className="eyebrow">Action center</p><h2>Alert aktif</h2></div>
          </div>
        </div>
        {snapshot.issues.length === 0 ? (
          <div className="empty-state"><CheckCircle2 aria-hidden="true" size={36} /><strong>Semua komponen sehat.</strong><p>Tidak ada backlog atau event ambigu yang membutuhkan tindakan.</p></div>
        ) : (
          <div className="dashboard-action-grid">
            {snapshot.issues.map((issue) => (
              <Link className="dashboard-action-card" href={issue.href} prefetch={false} key={issue.code}>
                {issue.code.includes("payment") ? <CreditCard aria-hidden="true" /> : issue.code.includes("delivery") ? <FileWarning aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
                <strong>{issue.title}</strong>
                <span>{issue.detail}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
