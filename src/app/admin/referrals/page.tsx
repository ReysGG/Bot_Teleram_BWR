import { Gift, Link2, Sparkles, UsersRound } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReferralSettingsControl } from "@/components/admin/referral-settings-control";
import { Prisma } from "@/generated/prisma/client";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { getReferralProgramState } from "@/server/referral/service";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";

export const dynamic = "force-dynamic";

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const where: Prisma.ReferralAttributionWhereInput = search
    ? {
        OR: [
          { referralCodeSnapshot: { contains: search, mode: "insensitive" } },
          { referrerChatId: { contains: search } },
          { referredChatId: { contains: search } },
          { referredUsername: { contains: search.replace(/^@/, ""), mode: "insensitive" } },
          { referredDisplayName: { contains: search, mode: "insensitive" } },
          { referralCode: { ownerUsername: { contains: search.replace(/^@/, ""), mode: "insensitive" } } },
          { referralCode: { ownerDisplayName: { contains: search, mode: "insensitive" } } },
        ],
      }
    : {};
  const [counts, setting, codeCount, joinCount, totalItems, pointAggregate, rewardAggregate] = await Promise.all([
    getAdminInventoryCounts(),
    getReferralProgramState(),
    prisma.referralCode.count(),
    prisma.referralAttribution.count(),
    prisma.referralAttribution.count({ where }),
    prisma.referralCode.aggregate({ _sum: { pointBalance: true } }),
    prisma.referralClaim.aggregate({ _sum: { rewardAmount: true } }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const referrals = await prisma.referralAttribution.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { referralCode: true },
    skip: pagination.skip,
    take: pagination.take,
  });

  return (
    <AdminShell active="referrals" counts={counts} description="Atur poin dan reward claim, lalu pantau kode, user baru, poin, dan bonus wallet referral." email={admin.email} eyebrow="Growth program" title="Referral">
      {query.notice === "settings" ? <AdminResultModal message="Pengaturan referral berhasil diperbarui." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Pengaturan referral tidak dapat disimpan." tone="error" /> : null}
      <ReferralSettingsControl {...setting} />

      <section className="metric-grid">
        <article className="metric-card accent-orange"><div className="metric-card-title"><span>Kode aktif</span><Link2 /></div><strong>{codeCount}</strong></article>
        <article className="metric-card accent-green"><div className="metric-card-title"><span>User join</span><UsersRound /></div><strong>{joinCount}</strong></article>
        <article className="metric-card accent-yellow"><div className="metric-card-title"><span>Poin tersimpan</span><Sparkles /></div><strong>{pointAggregate._sum.pointBalance ?? 0}</strong></article>
        <article className="metric-card accent-ink"><div className="metric-card-title"><span>Reward diclaim</span><Gift /></div><strong>{formatRupiah(rewardAggregate._sum.rewardAmount ?? 0)}</strong></article>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Referral ledger</p><h2>Riwayat user bergabung</h2></div>
          <AdminSearchForm action="/admin/referrals" id="referral-search" placeholder="Cari kode, @username, nama, chat ID..." value={search} />
        </div>
        {referrals.length === 0 ? <div className="empty-state"><strong>Belum ada referral ditemukan.</strong></div> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Kode</th><th>Pengajak</th><th>User baru</th><th>Poin</th><th>Bonus join</th><th>Waktu</th></tr></thead>
            <tbody>{referrals.map((item) => <tr key={item.id}>
              <td><strong>{item.referralCodeSnapshot}</strong></td>
              <td><strong>{item.referralCode.ownerUsername ? `@${item.referralCode.ownerUsername}` : item.referralCode.ownerDisplayName ?? item.referrerChatId}</strong><small>{item.referrerChatId}</small></td>
              <td><strong>{item.referredUsername ? `@${item.referredUsername}` : item.referredDisplayName ?? "User Telegram"}</strong><small>{item.referredChatId}</small></td>
              <td>+{item.pointsAwarded}</td>
              <td>{formatRupiah(item.newUserReward)}</td>
              <td>{item.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
            </tr>)}</tbody>
          </table></div>
        )}
        <AdminPagination ariaLabel="Pagination referral" basePath="/admin/referrals" currentPage={pagination.page} itemLabel="referral" pageSize={pagination.pageSize} query={{ q: search || undefined }} totalItems={pagination.totalItems} />
      </section>
    </AdminShell>
  );
}
