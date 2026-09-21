import Link from "next/link";
import { ArrowDownToLine, Coins, UsersRound } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { walletSearchWhere, walletTopupSearchWhere } from "@/server/admin/catalog-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { AdminWalletTopupAction } from "@/components/admin/admin-wallet-topup-action";
import { buildAdminReturnPath } from "@/server/admin/return-path";
import { adminWalletTopupProviderLabel } from "@/server/admin/wallet-topups";

export const dynamic = "force-dynamic";

export default async function AdminWalletPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    page?: string;
    topupPage?: string;
    q?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const walletWhere = walletSearchWhere(search);
  const topupWhere = walletTopupSearchWhere(search);
  const [counts, walletItems, topupItems, totalWallets, balanceAggregate, pendingTopups] =
    await Promise.all([
      getAdminInventoryCounts(),
      prisma.wallet.count({ where: walletWhere }),
      prisma.walletTopup.count({ where: topupWhere }),
      prisma.wallet.count(),
      prisma.wallet.aggregate({ _sum: { balance: true } }),
      prisma.walletTopup.count({
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
      }),
    ]);
  const walletPagination = adminPagination(walletItems, parseAdminPage(query.page), 20);
  const topupPagination = adminPagination(topupItems, parseAdminPage(query.topupPage), 15);
  const now = new Date();
  const topupReturnTo = buildAdminReturnPath({
    pathname: "/admin/wallet",
    query: {
      page: walletPagination.page > 1 ? walletPagination.page : undefined,
      q: search || undefined,
      topupPage: topupPagination.page > 1 ? topupPagination.page : undefined,
    },
    fragment: "topup-history",
  });
  const [wallets, recentTopups] = await Promise.all([
    prisma.wallet.findMany({
      where: walletWhere,
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { transactions: true, topups: true } } },
      skip: walletPagination.skip,
      take: walletPagination.take,
    }),
    prisma.walletTopup.findMany({
      where: topupWhere,
      orderBy: { createdAt: "desc" },
      include: {
        wallet: true,
        qrisInvoiceAttempt: { select: { providerKeySnapshot: true } },
      },
      skip: topupPagination.skip,
      take: topupPagination.take,
    }),
  ]);

  return (
    <AdminShell
      active="wallet"
      counts={counts}
      description="Pantau saldo, top up, pembelian saldo, refund delivery, dan koreksi admin dari ledger append-only."
      email={admin.email}
      eyebrow="Wallet ledger"
      title="Wallet & saldo"
    >
      {query.notice === "topup-confirmed" ? <AdminResultModal message="Top up dikonfirmasi dan saldo user sudah masuk." tone="success" /> : null}
      {query.error ? <AdminResultModal message={
        query.error === "payment_expired"
          ? "Invoice top up sudah melewati batas pembayaran. Gunakan rekonsiliasi event jika dana benar-benar masuk."
          : query.error === "payment_unavailable" || query.error === "payment_not_found"
            ? "Top up tidak lagi memenuhi syarat konfirmasi manual. Muat ulang dan periksa status terbaru."
            : "Operasi wallet gagal. Periksa status invoice atau log server."
      } tone="error" /> : null}
      <section className="metric-grid">
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>User wallet</span><UsersRound /></div>
          <strong>{totalWallets}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Total saldo</span><Coins /></div>
          <strong>{formatRupiah(balanceAggregate._sum.balance ?? 0)}</strong>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Top up aktif</span><ArrowDownToLine /></div>
          <strong>{pendingTopups}</strong>
        </article>
      </section>

      <section className="panel wide-panel" id="wallet-list">
        <div className="panel-heading">
          <div><p className="eyebrow">Buyer balances</p><h2>Semua wallet</h2></div>
          <AdminSearchForm action="/admin/wallet#wallet-list" id="wallet-search" placeholder="Cari @username, nama, chat ID, invoice..." value={search} />
        </div>
        {wallets.length === 0 ? (
          <div className="empty-state"><strong>Belum ada wallet.</strong></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>User</th><th>Chat ID</th><th>Saldo</th><th>Mutasi</th><th>Top up</th><th>Detail</th></tr></thead>
              <tbody>
                {wallets.map((wallet) => (
                  <tr key={wallet.chatId}>
                    <td><strong>{wallet.buyerUsername ? `@${wallet.buyerUsername}` : wallet.buyerDisplayName ?? "User Telegram"}</strong><small>{wallet.buyerDisplayName ?? "-"}</small></td>
                    <td>{wallet.chatId}</td>
                    <td><strong>{formatRupiah(wallet.balance)}</strong></td>
                    <td>{wallet._count.transactions}</td>
                    <td>{wallet._count.topups}</td>
                    <td><Link className="button button-small" href={`/admin/wallet/${encodeURIComponent(wallet.chatId)}`} prefetch={false}>Buka detail</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          ariaLabel="Pagination wallet"
          basePath="/admin/wallet"
          currentPage={walletPagination.page}
          fragment="wallet-list"
          itemLabel="wallet"
          pageSize={walletPagination.pageSize}
          query={{ q: search || undefined, topupPage: topupPagination.page > 1 ? String(topupPagination.page) : undefined }}
          totalItems={walletPagination.totalItems}
        />
      </section>

      <section className="panel wide-panel" id="topup-history">
        <div className="panel-heading"><div><p className="eyebrow">Payment queue</p><h2>Top up terbaru</h2></div></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Invoice</th><th>User</th><th>Metode</th><th>Saldo masuk</th><th>Kode</th><th>Total bayar</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
            <tbody>
              {recentTopups.map((topup) => (
                <tr key={topup.id}>
                  <td>{topup.invoiceNumber}</td>
                  <td><Link href={`/admin/wallet?q=${encodeURIComponent(topup.chatId)}#wallet-topups`} prefetch={false}>{topup.wallet.buyerUsername ? `@${topup.wallet.buyerUsername}` : topup.chatId}</Link></td>
                  <td><span className="status-pill status-neutral">{adminWalletTopupProviderLabel({
                    paymentMethod: topup.paymentMethod,
                    qrisProviderKey: topup.qrisInvoiceAttempt?.providerKeySnapshot,
                  })}</span></td>
                  <td>{formatRupiah(topup.baseAmount)}</td>
                  <td>Rp{topup.uniqueCode}</td>
                  <td>{formatRupiah(topup.billedAmount)}</td>
                  <td>
                    <span className={`status-pill ${topup.status === "PAID" ? "status-good" : topup.status === "PENDING" ? "status-warn" : "status-bad"}`}>
                      {topup.status === "EXPIRED" ? "KEDALUWARSA" : topup.status}
                    </span>
                  </td>
                  <td>{topup.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                  <td>
                    <AdminWalletTopupAction
                      now={now}
                      returnTo={topupReturnTo}
                      topup={topup}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          ariaLabel="Pagination top up"
          basePath="/admin/wallet"
          currentPage={topupPagination.page}
          fragment="topup-history"
          itemLabel="top up"
          pageParam="topupPage"
          pageSize={topupPagination.pageSize}
          query={{ q: search || undefined, page: walletPagination.page > 1 ? String(walletPagination.page) : undefined }}
          totalItems={topupPagination.totalItems}
        />
      </section>
    </AdminShell>
  );
}
