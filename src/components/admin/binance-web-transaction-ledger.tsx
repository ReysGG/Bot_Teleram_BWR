import Link from "next/link";
import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { parseAdminPage } from "@/server/admin/pagination";
import { listBinanceWebTransactions } from "@/server/payment/binance-web-session";
import { formatUsdtMicros } from "@/server/payment/usdt-amount";

const statuses = [
  "RECEIVED",
  "MATCHED",
  "CONFIRMED",
  "UNMATCHED",
  "AMBIGUOUS",
  "REJECTED",
] as const;

function parseStatus(value?: string) {
  return statuses.find((status) => status === value);
}

function tone(status: string) {
  if (status === "CONFIRMED" || status === "MATCHED") return "good";
  if (status === "AMBIGUOUS" || status === "REJECTED") return "bad";
  if (status === "UNMATCHED") return "warn";
  return "neutral";
}

export async function BinanceWebTransactionLedger({
  page,
  search,
  status,
}: {
  page?: string;
  search?: string;
  status?: string;
}) {
  const normalizedSearch = normalizeAdminSearch(search);
  const parsedStatus = status === "all" ? undefined : parseStatus(status);
  const statusValue = parsedStatus ?? "all";
  const ledger = await listBinanceWebTransactions({
    page: parseAdminPage(page),
    pageSize: 15,
    search: normalizedSearch || undefined,
    status: parsedStatus,
  });
  return (
    <section className="panel wide-panel usdt-bep20-ledger" id="binance-web-ledger">
      <div className="panel-heading">
        <div><p className="eyebrow">Web-session evidence</p><h2>Histori yang dibaca dari Binance</h2></div>
        <form action="/admin/payments/binance#binance-web-ledger" className="admin-search-form admin-filter-form" method="get">
          <input defaultValue={normalizedSearch} name="wq" placeholder="Cari transaction ID, Order ID, atau pengirim..." type="search" />
          <select defaultValue={statusValue} name="ws">
            <option value="all">Semua status</option>
            {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        </form>
      </div>
      {ledger.items.length === 0 ? (
        <div className="empty-state"><strong>Belum ada bukti web-session.</strong><p>Data muncul setelah session aktif berhasil membaca Payment History.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="usdt-bep20-ledger-table">
            <thead><tr><th>Waktu</th><th>Session</th><th>Nominal</th><th>Order ID</th><th>Transaction ID</th><th>Pengirim</th><th>Status</th><th>Invoice</th></tr></thead>
            <tbody>
              {ledger.items.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{transaction.occurredAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                  <td>{transaction.session.name}</td>
                  <td><strong>{formatUsdtMicros(Number(transaction.amountMicros))}</strong><small>{transaction.direction} / {transaction.providerStatus}</small></td>
                  <td><span className="usdt-bep20-hash">{transaction.providerOrderId ?? "Belum tersedia"}</span></td>
                  <td><span className="usdt-bep20-hash">{transaction.providerTransactionId}</span></td>
                  <td>{transaction.counterpartyName ?? "-"}<small>{transaction.viaAccountValue ?? "-"}</small></td>
                  <td><span className={`status-pill status-${tone(transaction.status)}`}>{transaction.status}</span><small>{transaction.rejectionReason ?? "-"}</small></td>
                  <td>{transaction.binanceInternalPaymentAttempt?.order ? <Link href={`/admin/orders/${transaction.binanceInternalPaymentAttempt.order.id}`} prefetch={false}>{transaction.binanceInternalPaymentAttempt.order.invoiceNumber}</Link> : "Belum terikat"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination bukti web-session Binance"
        basePath="/admin/payments/binance"
        currentPage={ledger.page}
        fragment="binance-web-ledger"
        itemLabel="bukti"
        pageParam="wp"
        pageSize={ledger.pageSize}
        query={{ wq: normalizedSearch || undefined, ws: statusValue === "all" ? undefined : statusValue }}
        totalItems={ledger.total}
      />
    </section>
  );
}
