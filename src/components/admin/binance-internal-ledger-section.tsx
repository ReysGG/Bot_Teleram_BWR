import Link from "next/link";
import { AdminOrderPaymentAction } from "./admin-order-payment-action";
import { Search } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { BinanceInternalRecheckButton } from "@/components/admin/binance-internal-recheck-button";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { parseAdminPage } from "@/server/admin/pagination";
import {
  binanceInternalStatusPresentation,
  canRecheckBinanceInternalAttempt,
  parseBinanceInternalLedgerStatus,
} from "@/server/admin/binance-internal-ledger";
import { listBinanceInternalAttempts } from "@/server/payment/binance-internal";
import { formatUsdtMicros } from "@/server/payment/usdt-amount";
import { formatRupiah } from "@/server/utils/format";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export async function BinanceInternalLedgerSection({
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
    : parseBinanceInternalLedgerStatus(status);
  const statusValue = parsedStatus ?? "all";
  const ledger = await listBinanceInternalAttempts({
    page: parseAdminPage(page),
    pageSize: 15,
    search: normalizedSearch || undefined,
    status: parsedStatus,
  });
  const returnTo = buildAdminReturnPath({
    pathname: "/admin/payments/binance",
    query: {
      bp: ledger.page > 1 ? ledger.page : undefined,
      bq: normalizedSearch || undefined,
      bs: statusValue === "all" ? undefined : statusValue,
    },
    fragment: "binance-internal-ledger",
  });

  return (
    <section className="panel wide-panel usdt-bep20-ledger" id="binance-internal-ledger">
      <div className="panel-heading">
        <div><p className="eyebrow">Internal payment ledger</p><h2>Transaksi Binance Pay</h2></div>
        <form action="/admin/payments/binance#binance-internal-ledger" className="admin-search-form admin-filter-form" method="get">
          <input defaultValue={normalizedSearch} name="bq" placeholder="Cari invoice, username, chat ID, atau Order ID..." type="search" />
          <select defaultValue={statusValue} name="bs">
            <option value="all">Semua status</option>
            <option value="AWAITING_ORDER_ID">Menunggu Order ID</option>
            <option value="VERIFYING">Memverifikasi</option>
            <option value="VERIFIED">Terverifikasi</option>
            <option value="CONFIRMED">Lunas</option>
            <option value="REJECTED">Ditolak</option>
            <option value="EXPIRED">Kedaluwarsa</option>
          </select>
          <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        </form>
      </div>
      {ledger.items.length === 0 ? (
        <div className="empty-state"><strong>Belum ada transaksi Binance Pay.</strong><p>Invoice akan muncul setelah user memilih Binance Pay.</p></div>
      ) : (
        <div className="table-wrap">
          <table className="usdt-bep20-ledger-table">
            <thead><tr><th>Invoice & user</th><th>Verifier</th><th>Expected USDT</th><th>Order ID</th><th>Status</th><th>Transaksi</th><th>Penerima</th><th>Pemeriksaan</th><th>Diagnostik</th><th>Aksi</th></tr></thead>
            <tbody>
              {ledger.items.map((attempt) => {
                const presentation = binanceInternalStatusPresentation(attempt.status, attempt.failureReason);
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
                    <td><strong>{attempt.verifierMode === "WEB_SESSION" ? "Web session" : "Official API"}</strong><small>{attempt.binanceWebSession?.name ?? (attempt.verifierMode === "WEB_SESSION" ? "Session snapshot" : "Signed API")}</small></td>
                    <td><strong>{formatUsdtMicros(Number(attempt.expectedUsdtMicros))}</strong><small>Kurs {formatRupiah(attempt.rateSnapshot)}/USDT</small></td>
                    <td><span className="usdt-bep20-hash">{attempt.submittedOrderId ?? "Belum dikirim"}</span><small>{attempt.webTransaction?.providerOrderId ?? "-"}</small></td>
                    <td><span className={`status-pill status-${presentation.tone}`}>{presentation.label}</span></td>
                    <td>{attempt.observedTransactionTime?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}<small>{attempt.observedOrderType ?? "-"} · {attempt.observedCurrency ?? "-"}</small></td>
                    <td>{attempt.observedReceiverBinanceId ?? attempt.recipientBinanceIdSnapshot}<small>{attempt.observedReceiverName ?? "Binance ID snapshot"}</small><small>{attempt.webTransaction?.providerTransactionId ?? "-"}</small></td>
                    <td>{attempt.lastCheckedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "Belum diperiksa"}</td>
                    <td className="usdt-bep20-diagnostic">{presentation.diagnostic}</td>
                    <td>
                      <AdminOrderPaymentAction now={new Date()} order={attempt.order} returnTo={returnTo} />
                      {canRecheckBinanceInternalAttempt({ status: attempt.status, submittedOrderId: attempt.submittedOrderId }) && attempt.submittedOrderId ? (
                        <BinanceInternalRecheckButton attemptId={attempt.id} invoiceNumber={attempt.order.invoiceNumber} returnTo={returnTo} submittedOrderId={attempt.submittedOrderId} />
                      ) : <span className="muted">Otomatis</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <AdminPagination
        ariaLabel="Pagination transaksi Binance Pay"
        basePath="/admin/payments/binance"
        currentPage={ledger.page}
        fragment="binance-internal-ledger"
        itemLabel="transaksi"
        pageParam="bp"
        pageSize={ledger.pageSize}
        query={{ bq: normalizedSearch || undefined, bs: statusValue === "all" ? undefined : statusValue }}
        totalItems={ledger.total}
      />
    </section>
  );
}
