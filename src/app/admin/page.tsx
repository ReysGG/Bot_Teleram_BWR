import Link from "next/link";
import {
  BadgeCheck,
  Boxes,
  ChartNoAxesCombined,
  CircleX,
  Clock3,
  PackageOpen,
  ReceiptText,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldBan,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  DashboardTransactions,
  DashboardTransactionTabs,
} from "@/components/admin/dashboard/dashboard-transactions";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { MaintenanceControl } from "@/components/admin/maintenance-control";
import { MetricCard } from "@/components/admin/metric-card";
import { PanelHeading } from "@/components/admin/panel-heading";
import {
  getAdminDashboardData,
  type AdminDashboardSearchParams,
} from "@/server/admin/dashboard";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  "payment-confirmed": "Pembayaran dikonfirmasi dan delivery masuk antrean.",
  "topup-confirmed": "Top up dikonfirmasi dan saldo user sudah ditambahkan satu kali.",
  "maintenance-enabled": "Maintenance aktif. Checkout baru dari bot sekarang ditolak.",
  "maintenance-disabled": "Maintenance selesai. Checkout baru sudah dibuka kembali.",
  "expired-payment-credited": "Pembayaran expired berhasil dimasukkan ke wallet tanpa kode unik. Produk tidak dikirim.",
  "expired-payment-already-credited": "Pembayaran expired tersebut sudah pernah dimasukkan ke wallet; saldo tidak ditambah dua kali.",
};

const errorMessages: Record<string, string> = {
  payment: "Pembayaran tidak dapat dikonfirmasi.",
  payment_expired: "Invoice sudah melewati batas pembayaran. Tunggu status expired lalu gunakan Add Wallet; produk tidak boleh dikirim dari approval manual.",
  payment_unavailable: "Pembayaran tidak lagi memenuhi syarat approval manual. Muat ulang data dan periksa status terbaru.",
  payment_not_found: "Data pembayaran tidak ditemukan.",
  topup: "Top up tidak dapat dikonfirmasi. Periksa status invoice dan provider pembayaran.",
  provider_recheck_required: "Pembayaran ini wajib diperiksa ulang melalui verifier provider dan tidak dapat di-approve manual.",
  maintenance: "Status maintenance tidak dapat diperbarui.",
  "expired-payment-credit": "Pembayaran expired gagal dimasukkan ke wallet. Pastikan status order masih expired dan pembayaran benar-benar sudah masuk.",
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminDashboardSearchParams>;
}) {
  const admin = await requireAdminPage();
  const dashboard = await getAdminDashboardData(await searchParams);
  const {
    bridgeAgeMinutes,
    bridgeStale,
    bridgeStatus,
    counts,
    failedDeliveryCount,
    failedNotificationCount,
    maintenance,
    manualReviewCount,
    productCount,
    query,
    unknownDeliveryCount,
    walletTopupAttentionCount,
  } = dashboard;

  return (
    <AdminShell
      active="overview"
      counts={counts}
      description="Ringkasan toko, antrean, pembeli, dan order terbaru. Pengelolaan katalog berada di menu Produk."
      email={admin.email}
      eyebrow="Store overview"
      title="Dashboard"
    >
      {query.notice ? <AdminResultModal message={noticeMessages[query.notice] ?? "Operasi selesai."} tone="success" /> : null}
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? "Operasi gagal."} tone="error" /> : null}

      <MaintenanceControl enabled={maintenance.enabled} message={maintenance.message} />

      <section className="metric-grid">
        <MetricCard accent="accent-orange" href="/admin/products" icon={<Boxes aria-hidden="true" />} label="Produk" value={productCount} />
        <MetricCard accent="accent-green" href="/admin/inventory/available" icon={<PackageOpen aria-hidden="true" />} label="Belum terjual" value={counts.available} />
        <MetricCard accent="accent-yellow" href="/admin/preorders" icon={<Clock3 aria-hidden="true" />} label="Preorder menunggu" value={counts.preorders} />
        <MetricCard accent="accent-ink" href="/admin/inventory/sold" icon={<BadgeCheck aria-hidden="true" />} label="Terjual" value={counts.sold} />
        <MetricCard accent="accent-red" href="/admin/inventory/banned" icon={<ShieldBan aria-hidden="true" />} label="Banned" value={counts.banned} />
      </section>

      {manualReviewCount > 0 ? <p className="alert alert-error">{manualReviewCount} delivery membutuhkan review manual agar file tidak terkirim dua kali.</p> : null}
      {bridgeStale ? (
        <p className="alert alert-error">
          DANA Bridge tidak mengirim heartbeat
          {bridgeAgeMinutes === null ? " dan belum pernah terhubung." : ` selama ${bridgeAgeMinutes} menit.`}
          {" "}Periksa aplikasi bridge, notification access, internet, dan battery optimization HP.
        </p>
      ) : bridgeStatus && bridgeStatus.queueSize > 0 ? (
        <p className="alert alert-error">DANA Bridge aktif, tetapi masih memiliki {bridgeStatus.queueSize} event di antrean Android.</p>
      ) : null}

      <section className="panel dashboard-actions-panel">
        <PanelHeading eyebrow="Action center" icon={<ShieldAlert aria-hidden="true" />} title="Butuh tindakan admin" />
        <div className="dashboard-action-grid">
          <Link className="dashboard-action-card" href="/admin/deliveries?status=FAILED" prefetch={false}><RefreshCcw aria-hidden="true" /><strong>{failedDeliveryCount} kiriman gagal</strong><span>Periksa dan retry hanya kegagalan yang sudah pasti.</span></Link>
          <Link className="dashboard-action-card" href="/admin/deliveries?status=UNKNOWN" prefetch={false}><ShieldAlert aria-hidden="true" /><strong>{unknownDeliveryCount} perlu review</strong><span>Hasil Telegram ambigu dan tidak boleh dikirim ulang otomatis.</span></Link>
          <Link className="dashboard-action-card" href="/admin/preorders" prefetch={false}><Clock3 aria-hidden="true" /><strong>{counts.preorders} menunggu stok</strong><span>Tambahkan atau pilih stok yang sesuai dengan produk order.</span></Link>
          <Link className="dashboard-action-card" href="/admin/deliveries" prefetch={false}><Send aria-hidden="true" /><strong>{failedNotificationCount + manualReviewCount} notifikasi bermasalah</strong><span>Audit kegagalan outbox dan kasus yang membutuhkan review.</span></Link>
          <Link className="dashboard-action-card" href="/admin?sheet=topups&topupStatus=problem#wallet-topups" prefetch={false}><CircleX aria-hidden="true" /><strong>{walletTopupAttentionCount} top up gagal / kedaluwarsa</strong><span>Lihat user, nominal pembayaran, dan jejak deteksi bridge terbaru.</span></Link>
        </div>
      </section>

      <DashboardTransactionTabs {...dashboard} />
      <DashboardTransactions {...dashboard} />

      <section className="panel dashboard-actions-panel">
        <PanelHeading eyebrow="Quick access" icon={<Boxes aria-hidden="true" />} title="Kelola toko" />
        <div className="dashboard-action-grid">
          <Link className="dashboard-action-card" href="/admin/reports" prefetch={false}><ChartNoAxesCombined aria-hidden="true" /><strong>Laporan penjualan</strong><span>Lihat omzet, tren harian, produk terlaris, SMS OTP, top up, dan refund.</span></Link>
          <Link className="dashboard-action-card" href="/admin/products" prefetch={false}><Boxes aria-hidden="true" /><strong>Produk & stok</strong><span>Tambah, edit harga, upload stok, dan notifikasi.</span></Link>
          <Link className="dashboard-action-card" href="/admin/orders" prefetch={false}><UsersRound aria-hidden="true" /><strong>Pembeli & order</strong><span>Lihat detail pembeli, pembayaran, dan pengiriman.</span></Link>
          <Link className="dashboard-action-card" href="/admin/wallet" prefetch={false}><WalletCards aria-hidden="true" /><strong>Wallet</strong><span>Pantau top up dan mutasi saldo pelanggan.</span></Link>
          <Link className="dashboard-action-card" href="/admin/deliveries" prefetch={false}><Send aria-hidden="true" /><strong>Tracking kiriman</strong><span>Lihat produk terkirim, penerima, dan status Telegram.</span></Link>
          <Link className="dashboard-action-card" href="/admin/broadcasts" prefetch={false}><ReceiptText aria-hidden="true" /><strong>Broadcast admin</strong><span>Buat pengumuman dan pantau progres pengiriman.</span></Link>
        </div>
      </section>
    </AdminShell>
  );
}
