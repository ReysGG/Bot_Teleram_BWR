import Link from "next/link";
import { Clock3, MessageCircleMore, Megaphone, Send, UsersRound } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { BroadcastComposer } from "@/components/admin/broadcast-composer";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    notice?: string;
    page?: string;
    recipients?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, subscriberCount, totalItems, queuedCount] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.botSession.count({ where: { broadcastEnabled: true } }),
    prisma.adminBroadcast.count(),
    prisma.telegramNotification.count({
      where: {
        broadcastId: { not: null },
        status: { in: ["PENDING", "PROCESSING"] },
      },
    }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 10);
  const broadcasts = await prisma.adminBroadcast.findMany({
    orderBy: { createdAt: "desc" },
    skip: pagination.skip,
    take: pagination.take,
  });
  const broadcastIds = broadcasts.map((broadcast) => broadcast.id);
  const grouped = broadcastIds.length
    ? await prisma.telegramNotification.groupBy({
        by: ["broadcastId", "status"],
        where: { broadcastId: { in: broadcastIds } },
        _count: { _all: true },
      })
    : [];
  const statusCounts = new Map<string, Record<string, number>>();
  grouped.forEach((row) => {
    if (!row.broadcastId) return;
    const current = statusCounts.get(row.broadcastId) ?? {};
    current[row.status] = row._count._all;
    statusCounts.set(row.broadcastId, current);
  });

  return (
    <AdminShell
      active="broadcasts"
      counts={counts}
      description="Kirim pengumuman ke pengguna yang mengaktifkan notifikasi dan pantau progres outbox Telegram."
      email={admin.email}
      eyebrow="Admin announcements"
      title="Broadcast"
    >
      {query.notice === "queued" ? (
        <AdminResultModal
          message={`Pengumuman masuk antrean untuk ${query.recipients ?? "0"} penerima.`}
          tone="success"
        />
      ) : null}
      {query.error ? (
        <AdminResultModal
          message={query.error === "broadcast-format"
            ? "Format Telegram tidak valid. Periksa panjang pesan, link HTTPS, dan format yang saling bertumpuk."
            : "Broadcast gagal dibuat. Periksa judul, isi pesan, dan coba lagi."}
          tone="error"
        />
      ) : null}

      <section className="metric-grid">
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>Total broadcast</span><Megaphone aria-hidden="true" /></div>
          <strong>{totalItems}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Subscriber aktif</span><UsersRound aria-hidden="true" /></div>
          <strong>{subscriberCount}</strong>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Masih antre</span><Clock3 aria-hidden="true" /></div>
          <strong>{queuedCount}</strong>
        </article>
      </section>

      <section className="panel broadcast-intro-panel">
        <div>
          <p className="eyebrow">Compose</p>
          <h2>Umumkan sesuatu ke pelanggan</h2>
          <p className="muted">
            Pengguna yang memilih berhenti menerima notifikasi tidak akan dikirimi pesan.
            Setiap penerima memiliki record outbox sendiri agar retry aman dan terpantau.
          </p>
        </div>
        <div className="admin-modal-actions">
          <BroadcastComposer subscriberCount={subscriberCount} />
          <Link className="button button-ghost" href="/admin/broadcasts/reengagement" prefetch={false}>
            <MessageCircleMore aria-hidden="true" size={18} /> Atur win-back otomatis
          </Link>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Campaign history</p>
            <h2>Riwayat pengumuman</h2>
          </div>
        </div>
        {broadcasts.length === 0 ? (
          <div className="empty-state"><strong>Belum ada broadcast admin.</strong></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Pengumuman</th><th>Penerima</th><th>Terkirim</th><th>Antre</th><th>Gagal/review</th><th>Dibuat</th></tr>
              </thead>
              <tbody>
                {broadcasts.map((broadcast) => {
                  const statuses = statusCounts.get(broadcast.id) ?? {};
                  const sent = statuses.SENT ?? 0;
                  const queued = (statuses.PENDING ?? 0) + (statuses.PROCESSING ?? 0);
                  const failed = (statuses.FAILED ?? 0) + (statuses.MANUAL_REVIEW ?? 0);
                  return (
                    <tr key={broadcast.id}>
                      <td>
                        <strong>{broadcast.title}</strong>
                        <small>{broadcast.messageText.slice(0, 120)}{broadcast.messageText.length > 120 ? "..." : ""}</small>
                      </td>
                      <td>{broadcast.recipientCount}</td>
                      <td><span className="status-pill status-good"><Send aria-hidden="true" size={14} /> {sent}</span></td>
                      <td>{queued}</td>
                      <td>{failed}</td>
                      <td>
                        {broadcast.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}
                        <small>{broadcast.createdBy}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          ariaLabel="Pagination riwayat broadcast"
          basePath="/admin/broadcasts"
          currentPage={pagination.page}
          itemLabel="broadcast"
          pageSize={pagination.pageSize}
          totalItems={pagination.totalItems}
        />
      </section>
    </AdminShell>
  );
}
