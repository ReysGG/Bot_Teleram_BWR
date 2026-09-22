import Link from "next/link";
import { notFound } from "next/navigation";
import { Coins, History, UserRound } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminSearchForm } from "@/components/admin/admin-search-form";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { walletTransactionSearchWhere } from "@/server/admin/catalog-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch, orderSearchWhere } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export const dynamic = "force-dynamic";

export default async function AdminWalletDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ chatId: string }>;
  searchParams: Promise<{
    notice?: string;
    error?: string;
    txPage?: string;
    orderPage?: string;
    q?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const [{ chatId }, query, counts] = await Promise.all([
    params,
    searchParams,
    getAdminInventoryCounts(),
  ]);
  const wallet = await prisma.wallet.findUnique({ where: { chatId } });
  if (!wallet) notFound();
  const search = normalizeAdminSearch(query.q);
  const transactionWhere = {
    AND: [{ walletChatId: chatId }, walletTransactionSearchWhere(search)],
  };
  const orderWhere = { AND: [{ chatId }, orderSearchWhere(search)] };
  const [transactionItems, orderItems, totalTransactions, totalOrders] = await Promise.all([
    prisma.walletTransaction.count({ where: transactionWhere }),
    prisma.order.count({ where: orderWhere }),
    prisma.walletTransaction.count({ where: { walletChatId: chatId } }),
    prisma.order.count({ where: { chatId } }),
  ]);
  const transactionPagination = adminPagination(
    transactionItems,
    parseAdminPage(query.txPage),
    25,
  );
  const orderPagination = adminPagination(orderItems, parseAdminPage(query.orderPage), 20);
  const returnTo = buildAdminReturnPath({
    pathname: `/admin/wallet/${encodeURIComponent(chatId)}`,
    query: {
      orderPage: orderPagination.page > 1 ? orderPagination.page : undefined,
      q: search || undefined,
      txPage: transactionPagination.page > 1 ? transactionPagination.page : undefined,
    },
    fragment: "wallet-adjustment",
  });
  const [transactions, orders] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: transactionWhere,
      orderBy: { createdAt: "desc" },
      skip: transactionPagination.skip,
      take: transactionPagination.take,
    }),
    prisma.order.findMany({
      where: orderWhere,
      orderBy: { createdAt: "desc" },
      skip: orderPagination.skip,
      take: orderPagination.take,
      include: { payment: true },
    }),
  ]);

  return (
    <AdminShell
      active="wallet"
      counts={counts}
      description="Setiap perubahan saldo memiliki idempotency key, saldo sebelum/sesudah, pelaku, dan referensi transaksi."
      email={admin.email}
      eyebrow="Wallet detail"
      title={wallet.buyerUsername ? `@${wallet.buyerUsername}` : wallet.buyerDisplayName ?? wallet.chatId}
    >
      {query.notice === "adjusted" ? <AdminResultModal message="Saldo berhasil disesuaikan dan dicatat di ledger." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Saldo gagal disesuaikan. Periksa nominal dan pastikan saldo tidak menjadi minus." tone="error" /> : null}

      <section className="metric-grid">
        <article className="metric-card accent-green"><div className="metric-card-title"><span>Saldo</span><Coins /></div><strong>{formatRupiah(wallet.balance)}</strong></article>
        <article className="metric-card accent-orange"><div className="metric-card-title"><span>Mutasi</span><History /></div><strong>{totalTransactions}</strong></article>
        <article className="metric-card accent-yellow"><div className="metric-card-title"><span>Order</span><UserRound /></div><strong>{totalOrders}</strong></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-heading"><div><p className="eyebrow">Identity</p><h2>User Telegram</h2></div></div>
          <p><strong>Username:</strong> {wallet.buyerUsername ? `@${wallet.buyerUsername}` : "-"}</p>
          <p><strong>Nama:</strong> {wallet.buyerDisplayName ?? "-"}</p>
          <p><strong>Chat ID:</strong> {wallet.chatId}</p>
          <Link className="button button-small button-ghost" href="/admin/wallet" prefetch={false}>Kembali ke wallet</Link>
        </article>
        <article className="panel panel-dark" id="wallet-adjustment">
          <div className="panel-heading"><div><p className="eyebrow">Admin adjustment</p><h2>Tambah / kurangi saldo</h2></div></div>
          <form className="stack-form" action={`/api/admin/wallet/${encodeURIComponent(wallet.chatId)}/adjust`} method="post">
            <input name="returnTo" type="hidden" value={returnTo} />
            <label>Aksi<select name="direction" defaultValue="credit"><option value="credit">Tambah saldo</option><option value="debit">Kurangi saldo</option></select></label>
            <label>Nominal<input name="amount" type="number" min="1" max="100000000" required placeholder="10000" /></label>
            <label>Catatan<textarea name="note" maxLength={500} required rows={3} placeholder="Alasan penyesuaian saldo" /></label>
            <button className="button button-light" type="submit">Simpan mutasi</button>
          </form>
        </article>
      </section>

      <section className="panel wide-panel" id="wallet-transactions">
        <div className="panel-heading"><div><p className="eyebrow">Append-only ledger</p><h2>Riwayat saldo</h2></div><AdminSearchForm action={`/admin/wallet/${encodeURIComponent(chatId)}#wallet-transactions`} id="wallet-detail-search" placeholder="Cari catatan, pelaku, invoice..." value={search} /></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Waktu</th><th>Jenis</th><th>Nominal</th><th>Sebelum</th><th>Sesudah</th><th>Pelaku</th><th>Catatan</th></tr></thead>
          <tbody>{transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>{transaction.createdAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
              <td>{transaction.type}</td>
              <td className={transaction.amount > 0 ? "status-good" : "status-bad"}>{transaction.amount > 0 ? "+" : "-"}{formatRupiah(Math.abs(transaction.amount))}</td>
              <td>{formatRupiah(transaction.balanceBefore)}</td>
              <td>{formatRupiah(transaction.balanceAfter)}</td>
              <td>{transaction.actor ?? "-"}</td>
              <td>{transaction.note ?? "-"}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <AdminPagination ariaLabel="Pagination mutasi wallet" basePath={`/admin/wallet/${encodeURIComponent(chatId)}`} currentPage={transactionPagination.page} fragment="wallet-transactions" itemLabel="mutasi" pageParam="txPage" pageSize={transactionPagination.pageSize} query={{ q: search || undefined, orderPage: orderPagination.page > 1 ? String(orderPagination.page) : undefined }} totalItems={transactionPagination.totalItems} />
      </section>

      <section className="panel wide-panel" id="wallet-orders">
        <div className="panel-heading"><div><p className="eyebrow">Related orders</p><h2>Pembelian user</h2></div></div>
        <div className="table-wrap"><table>
          <thead><tr><th>Invoice</th><th>Metode</th><th>Total</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>{orders.map((order) => (
            <tr key={order.id}><td>{order.invoiceNumber}</td><td>{order.payment?.method ?? "-"}</td><td>{formatRupiah(order.grandTotal)}</td><td>{order.status}</td><td><Link className="button button-small" href={`/admin/orders/${order.id}`} prefetch={false}>Buka</Link></td></tr>
          ))}</tbody>
        </table></div>
        <AdminPagination ariaLabel="Pagination order wallet" basePath={`/admin/wallet/${encodeURIComponent(chatId)}`} currentPage={orderPagination.page} fragment="wallet-orders" itemLabel="order" pageParam="orderPage" pageSize={orderPagination.pageSize} query={{ q: search || undefined, txPage: transactionPagination.page > 1 ? String(transactionPagination.page) : undefined }} totalItems={orderPagination.totalItems} />
      </section>
    </AdminShell>
  );
}
