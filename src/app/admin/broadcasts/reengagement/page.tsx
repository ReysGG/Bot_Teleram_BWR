import Link from "next/link";
import {
  Clock3,
  History,
  MessageCircleMore,
  Send,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReengagementSettingsControl } from "@/components/admin/reengagement-settings-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import {
  getReengagementDeliveryStats,
} from "@/server/telegram/reengagement";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

function numberParam(value: string | undefined) {
  return Number.parseInt(value ?? "0", 10) || 0;
}

export default async function ReengagementSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    queued?: string;
    buyers?: string;
    nonBuyers?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, stats] = await Promise.all([
    getAdminInventoryCounts(),
    getReengagementDeliveryStats(),
  ]);

  return (
    <AdminShell
      active="broadcasts"
      counts={counts}
      description="Atur otomasi pengingat untuk user bot yang lama tidak berinteraksi, termasuk user yang belum pernah membeli."
      email={admin.email}
      eyebrow="Automated customer engagement"
      title="Win-back Telegram"
    >
      {query.notice === "settings-saved" ? (
        <AdminResultModal
          message="Pengaturan win-back berhasil disimpan. Worker berikutnya memakai threshold, cooldown, maksimum, batch, dan template terbaru."
          tone="success"
        />
      ) : null}
      {query.notice === "batch-queued" ? (
        <AdminResultModal
          message={`${numberParam(query.queued)} pesan masuk antrean: ${numberParam(query.buyers)} pembeli lama dan ${numberParam(query.nonBuyers)} user yang belum pernah membeli.`}
          title="Batch win-back selesai"
          tone="success"
        />
      ) : null}
      {query.error === "audience-ack" ? (
        <AdminResultModal
          message="Konfirmasi audience wajib dicentang karena fitur ini menjangkau seluruh user bot yang eligible, termasuk never-buyer, tanpa memakai broadcastEnabled."
          tone="error"
        />
      ) : null}
      {query.error === "settings-invalid" ? (
        <AdminResultModal
          message="Nilai threshold, cooldown, maksimum pesan, batch, atau template berada di luar batas yang diizinkan."
          tone="error"
        />
      ) : null}
      {query.error === "settings-save" ? (
        <AdminResultModal message="Pengaturan win-back tidak dapat disimpan. Coba lagi tanpa mengubah data lain." tone="error" />
      ) : null}
      {query.error === "disabled" ? (
        <AdminResultModal message="Aktifkan dan simpan otomasi win-back sebelum menjalankan batch manual." tone="error" />
      ) : null}
      {query.error === "run-failed" ? (
        <AdminResultModal message="Batch win-back belum dapat dibuat. Tidak ada pesan yang diklaim berhasil oleh proses ini." tone="error" />
      ) : null}

      <section className="metric-grid">
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>User reachable</span><UsersRound aria-hidden="true" /></div>
          <strong>{stats.totalUsers}</strong>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Masih antre</span><Clock3 aria-hidden="true" /></div>
          <strong>{stats.queued}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Terkirim</span><Send aria-hidden="true" /></div>
          <strong>{stats.sent}</strong>
        </article>
        <article className="metric-card accent-ink">
          <div className="metric-card-title"><span>Gagal/review</span><ShieldAlert aria-hidden="true" /></div>
          <strong>{stats.failed}</strong>
        </article>
      </section>

      <section className="panel broadcast-intro-panel">
        <div>
          <p className="eyebrow">Audience boundary</p>
          <h2>Berbeda dari broadcast produk</h2>
          <p className="muted">
            Win-back memindai semua chat bot yang masih reachable, termasuk user tanpa order.
            Toggle pengumuman produk <strong>broadcastEnabled</strong> tidak menjadi filter.
          </p>
        </div>
        <div className="admin-modal-actions">
          <Link className="button button-ghost" href="/admin/broadcasts/reengagement/history" prefetch={false}>
            <History aria-hidden="true" size={17} /> Riwayat pengiriman
          </Link>
          <Link className="button button-primary" href="/admin/broadcasts" prefetch={false}>
            <MessageCircleMore aria-hidden="true" size={17} /> Broadcast manual
          </Link>
        </div>
      </section>

      <ReengagementSettingsControl
        settings={{
          enabled: stats.settings.enabled,
          buyerInactiveDays: stats.settings.buyerInactiveDays,
          nonBuyerInactiveDays: stats.settings.nonBuyerInactiveDays,
          cooldownDays: stats.settings.cooldownDays,
          maxMessages: stats.settings.maxMessages,
          batchSize: stats.settings.batchSize,
          buyerMessage: stats.settings.buyerMessage,
          nonBuyerMessage: stats.settings.nonBuyerMessage,
        }}
        totalUsers={stats.totalUsers}
        updatedAt={stats.settings.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null}
        updatedBy={stats.settings.updatedBy}
      />

      <p className="fine-print">
        Pengiriman terakhir: {stats.latestSentAt
          ? stats.latestSentAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
          : "belum ada pesan win-back terkirim"}.
      </p>
    </AdminShell>
  );
}
