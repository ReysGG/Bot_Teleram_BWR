import Link from "next/link";
import { AlertTriangle, BadgeCheck, CreditCard, Search, ShieldCheck } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentReconciliationForm } from "@/components/admin/payment-reconciliation-form";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import {
  findPaymentReconciliationCandidates,
  paymentEventDiagnostic,
  reconciliationEventWhere,
} from "@/server/payment/reconciliation";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  already_confirmed: "Event pembayaran sudah dikonfirmasi sebelumnya.",
  amount_mismatch: "Nominal event tidak sama dengan transaksi yang dipilih.",
  amount_missing: "Event tidak memiliki nominal yang dapat diverifikasi.",
  event_not_found: "Event pembayaran tidak ditemukan.",
  event_not_ready: "Hanya event yang ditolak dan belum dikonfirmasi yang dapat direkonsiliasi.",
  invalid_input: "Pilih transaksi dan isi catatan audit minimal 3 karakter.",
  outside_window: "Waktu event berada di luar batas aman transaksi ini.",
  provider_mismatch: "Provider event tidak sesuai dengan metode transaksi. Event DANA dan Bank Jago tidak boleh dipertukarkan.",
  reason_required: "Catatan audit wajib diisi.",
  target_conflict: "Event sudah terhubung ke transaksi lain.",
  target_unavailable: "Transaksi tujuan sudah dibayar atau tidak lagi dapat diproses.",
  unknown: "Rekonsiliasi gagal. Tidak ada saldo atau order yang diubah.",
};

function statusWhere(status: string | undefined) {
  if (status === "REJECTED" || status === "CONFIRMED" || status === "RECEIVED") {
    return { status } as const;
  }
  if (status === "problem") return { status: "REJECTED" as const };
  return {};
}

export default async function PaymentReconciliationPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    event?: string;
    notice?: string;
    error?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const where = { AND: [reconciliationEventWhere(search), statusWhere(query.status)] };
  const [counts, totalItems, rejectedCount, confirmedCount] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.bridgePaymentEvent.count({ where }),
    prisma.bridgePaymentEvent.count({ where: { status: "REJECTED" } }),
    prisma.bridgePaymentEvent.count({ where: { status: "CONFIRMED" } }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const ledgerQuery = {
    page: pagination.page > 1 ? pagination.page : undefined,
    q: search || undefined,
    status: query.status === "all" ? undefined : query.status,
  };
  const ledgerReturnTo = buildAdminReturnPath({
    pathname: "/admin/payments/reconciliation",
    query: ledgerQuery,
    fragment: "reconciliation-ledger",
  });
  const reviewReturnTo = buildAdminReturnPath({
    pathname: "/admin/payments/reconciliation",
    query: { ...ledgerQuery, event: query.event },
    fragment: "reconciliation-review",
  });
  const [events, selectedEvent, candidates] = await Promise.all([
    prisma.bridgePaymentEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: pagination.skip,
      take: pagination.take,
      include: {
        order: { select: { invoiceNumber: true } },
        walletTopup: { select: { invoiceNumber: true } },
      },
    }),
    query.event
      ? prisma.bridgePaymentEvent.findUnique({ where: { eventId: query.event } })
      : null,
    query.event ? findPaymentReconciliationCandidates(query.event) : [],
  ]);

  return (
    <AdminShell
      active="payments"
      counts={counts}
      description="Review event DANA/Bank Jago yang belum cocok. Provider, nominal, waktu, dan target tetap divalidasi sebelum perubahan saldo atau order."
      email={admin.email}
      eyebrow="Payment reconciliation"
      title="Rekonsiliasi pembayaran"
    >
      <PaymentOperationsNav active="reconciliation" />
      {query.notice === "reconciled" ? (
        <AdminResultModal message="Event berhasil direkonsiliasi satu kali. Pembayaran terlambat masuk wallet tanpa mengirim produk." tone="success" />
      ) : null}
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? errorMessages.unknown} tone="error" /> : null}

      <section className="metric-grid">
        <article className="metric-card accent-orange"><div className="metric-card-title"><span>Event ditemukan</span><CreditCard aria-hidden="true" /></div><strong>{totalItems}</strong></article>
        <article className="metric-card accent-red"><div className="metric-card-title"><span>Perlu review</span><AlertTriangle aria-hidden="true" /></div><strong>{rejectedCount}</strong></article>
        <article className="metric-card accent-green"><div className="metric-card-title"><span>Terkonfirmasi</span><ShieldCheck aria-hidden="true" /></div><strong>{confirmedCount}</strong></article>
      </section>

      {selectedEvent ? (
        <section className="panel panel-dark wide-panel" id="reconciliation-review">
          <div className="panel-heading">
            <div><p className="eyebrow">Selected event</p><h2>Review event {selectedEvent.eventId.slice(0, 18)}...</h2></div>
            <Link className="button button-small button-light" href={reviewReturnTo} prefetch={false}>Tutup review</Link>
          </div>
          <p>Nominal: <strong>{selectedEvent.amount ? formatRupiah(selectedEvent.amount) : "Tidak terbaca"}</strong> - diterima {selectedEvent.receivedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</p>
          {selectedEvent.status !== "REJECTED" ? (
            <p className="alert alert-success">Event ini tidak memerlukan rekonsiliasi manual.</p>
          ) : candidates.length === 0 ? (
            <p className="alert alert-error">Tidak ada transaksi dengan nominal dan jendela waktu yang cocok. Jangan kreditkan tanpa bukti mutasi lain.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Target</th><th>User</th><th>Nominal</th><th>Status</th><th>Konfirmasi</th></tr></thead>
                <tbody>
                  {candidates.map((candidate) => (
                    <tr key={`${candidate.kind}:${candidate.id}`}>
                      <td><strong>{candidate.invoiceNumber}</strong><small>{candidate.kind === "order" ? "Order produk" : "Top up wallet"}</small></td>
                      <td>{candidate.buyerUsername ? `@${candidate.buyerUsername}` : candidate.buyerDisplayName ?? candidate.chatId}<small>{candidate.chatId}</small></td>
                      <td>{formatRupiah(candidate.amount)}</td>
                      <td><span className={`status-pill ${candidate.late ? "status-warn" : "status-good"}`}>{candidate.late ? "Kedaluwarsa - masuk wallet" : "Masih aktif"}</span></td>
                      <td><PaymentReconciliationForm eventId={selectedEvent.eventId} invoiceNumber={candidate.invoiceNumber} late={candidate.late} returnTo={reviewReturnTo} targetId={candidate.id} targetKind={candidate.kind} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      <section className="panel wide-panel" id="reconciliation-ledger">
        <div className="panel-heading">
          <div><p className="eyebrow">Bridge event ledger</p><h2>Jejak event pembayaran</h2></div>
          <form action="/admin/payments/reconciliation#reconciliation-ledger" className="admin-search-form" method="get">
            <input defaultValue={search} name="q" placeholder="Cari event atau invoice..." type="search" />
            <select defaultValue={query.status ?? "all"} name="status">
              <option value="all">Semua status</option>
              <option value="problem">Perlu review</option>
              <option value="CONFIRMED">Terkonfirmasi</option>
              <option value="RECEIVED">Baru diterima</option>
            </select>
            <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
          </form>
        </div>
        {events.length === 0 ? (
          <div className="empty-state"><strong>Event tidak ditemukan.</strong></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Waktu</th><th>Nominal</th><th>Status</th><th>Transaksi</th><th>Diagnostik</th><th>Aksi</th></tr></thead>
              <tbody>
                {events.map((event) => {
                  const diagnostic = paymentEventDiagnostic(event.status, event.reason);
                  const invoice = event.order?.invoiceNumber ?? event.walletTopup?.invoiceNumber;
                  return (
                    <tr key={event.id}>
                      <td>{event.receivedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}<small>{event.source}</small></td>
                      <td><strong>{event.amount ? formatRupiah(event.amount) : "-"}</strong></td>
                      <td><span className={`status-pill status-${diagnostic.tone}`}>{diagnostic.label}</span></td>
                      <td>{invoice ?? "Belum terhubung"}</td>
                      <td>{diagnostic.detail}</td>
                      <td>{event.status === "REJECTED" ? <Link className="button button-small" href={buildAdminReturnPath({ pathname: "/admin/payments/reconciliation", query: { ...ledgerQuery, event: event.eventId }, fragment: "reconciliation-review" })} prefetch={false}>Review</Link> : <BadgeCheck aria-hidden="true" size={18} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination ariaLabel="Pagination event pembayaran" basePath="/admin/payments/reconciliation" currentPage={pagination.page} fragment="reconciliation-ledger" itemLabel="event" pageSize={pagination.pageSize} query={{ q: search || undefined, status: query.status === "all" ? undefined : query.status }} totalItems={pagination.totalItems} />
      </section>
    </AdminShell>
  );
}
