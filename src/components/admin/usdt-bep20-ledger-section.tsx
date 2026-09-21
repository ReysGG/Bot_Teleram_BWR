import Link from "next/link";
import { AdminOrderPaymentAction } from "./admin-order-payment-action";
import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UsdtBep20RecheckButton } from "@/components/admin/usdt-bep20-recheck-button";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { parseAdminPage } from "@/server/admin/pagination";
import {
  canRecheckUsdtBep20Attempt,
  parseUsdtBep20LedgerStatus,
  usdtBep20StatusPresentation,
} from "@/server/admin/usdt-bep20-ledger";
import { listUsdtBep20Attempts } from "@/server/payment/usdt-bep20";
import { formatUsdtMicros } from "@/server/payment/usdt-amount";
import { formatRupiah } from "@/server/utils/format";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export async function UsdtBep20LedgerSection({
  page,
  search,
  status,
}: {
  page?: string;
  search?: string;
  status?: string;
}) {
  const normalizedSearch = normalizeAdminSearch(search);
  const parsedStatus = status === "all"
    ? undefined
    : parseUsdtBep20LedgerStatus(status);
  const statusValue = parsedStatus ?? "all";
  const ledger = await listUsdtBep20Attempts({
    page: parseAdminPage(page),
    pageSize: 15,
    search: normalizedSearch || undefined,
    status: parsedStatus,
  });
  const returnTo = buildAdminReturnPath({
    pathname: "/admin/payments/usdt-bep20",
    query: {
      up: ledger.page > 1 ? ledger.page : undefined,
      uq: normalizedSearch || undefined,
      us: statusValue === "all" ? undefined : statusValue,
    },
    fragment: "usdt-bep20-ledger",
  });

  return (
    <section className="panel wide-panel usdt-bep20-ledger" id="usdt-bep20-ledger">
      <div className="panel-heading">
        <div><p className="eyebrow">On-chain attempt ledger</p><h2>Transaksi USDT BEP20</h2></div>
        <form action="/admin/payments/usdt-bep20#usdt-bep20-ledger" className="admin-search-form admin-filter-form" method="get">
          <input defaultValue={normalizedSearch} name="uq" placeholder="Cari invoice, username, chat ID, atau tx hash..." type="search" />
          <select defaultValue={statusValue} name="us">
            <option value="all">Semua status</option>
            <option value="AWAITING_TX_HASH">Menunggu hash</option>
            <option value="VERIFYING">Memverifikasi</option>
            <option value="PENDING_CONFIRMATIONS">Menunggu blok</option>
            <option value="VERIFIED">Terverifikasi</option>
            <option value="CONFIRMED">Lunas</option>
            <option value="REJECTED">Ditolak</option>
            <option value="EXPIRED">Kedaluwarsa</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        </form>
      </div>
      {ledger.items.length === 0 ? (
        <div className="empty-state"><strong>Belum ada transaksi USDT BEP20.</strong><p>Invoice on-chain akan muncul di sini bersama hasil verifikasi blockchain.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="usdt-bep20-ledger-table">
            <thead><tr><th>Invoice & user</th><th>Expected USDT</th><th>Tx hash</th><th>Status</th><th>Block</th><th>Konfirmasi</th><th>Pemeriksaan</th><th>Diagnostik</th><th>Aksi</th></tr></thead>
            <tbody>
              {ledger.items.map((attempt) => {
                const presentation = usdtBep20StatusPresentation(attempt.status, attempt.failureReason);
                const username = attempt.order.buyerUsername
                  ? `@${attempt.order.buyerUsername}`
                  : attempt.order.buyerDisplayName ?? attempt.order.chatId;
                return (
                  <tr key={attempt.id}>
                    <td>
                      <Link href={`/admin/orders/${attempt.orderId}`} prefetch={false}><strong>{attempt.order.invoiceNumber}</strong></Link>
                      <small>{username} - {attempt.order.chatId}</small>
                      <small>{attempt.order.items.map((item) => item.productNameSnapshot).join(", ")}</small>
                    </td>
                    <td><strong>{formatUsdtMicros(Number(attempt.expectedUsdtMicros))}</strong><small>Kurs {formatRupiah(attempt.rateSnapshot)}/USDT</small></td>
                    <td>{attempt.txHash ? <a className="usdt-bep20-hash" href={`https://bscscan.com/tx/${encodeURIComponent(attempt.txHash)}`} rel="noreferrer" target="_blank">{attempt.txHash}</a> : <span className="muted">Belum dikirim</span>}</td>
                    <td><span className={`status-pill status-${presentation.tone}`}>{presentation.label}</span></td>
                    <td>{attempt.blockNumber?.toString() ?? "-"}</td>
                    <td><strong>{attempt.confirmations ?? 0}/{attempt.requiredConfirmationsSnapshot}</strong></td>
                    <td>{attempt.lastCheckedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "Belum diperiksa"}</td>
                    <td className="usdt-bep20-diagnostic">{presentation.diagnostic}</td>
                    <td><AdminOrderPaymentAction now={new Date()} order={attempt.order} returnTo={returnTo} />{canRecheckUsdtBep20Attempt({ status: attempt.status, txHash: attempt.txHash }) && attempt.txHash ? <UsdtBep20RecheckButton attemptId={attempt.id} invoiceNumber={attempt.order.invoiceNumber} returnTo={returnTo} txHash={attempt.txHash} /> : <span className="muted">Otomatis</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination transaksi USDT BEP20"
        basePath="/admin/payments/usdt-bep20"
        currentPage={ledger.page}
        fragment="usdt-bep20-ledger"
        itemLabel="transaksi"
        pageParam="up"
        pageSize={ledger.pageSize}
        query={{ uq: normalizedSearch || undefined, us: statusValue === "all" ? undefined : statusValue }}
        totalItems={ledger.total}
      />
    </section>
  );
}
