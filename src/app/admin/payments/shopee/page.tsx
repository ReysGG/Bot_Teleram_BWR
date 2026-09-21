import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";

export const dynamic = "force-dynamic";

function shortFingerprint(value: string | null): string {
  return value ? `${value.slice(0, 12)}...` : "-";
}

function maskedTransactionId(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default async function ShopeePartnerPaymentsPage() {
  const admin = await requireAdminPage();
  const [counts, sessions, transactions] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.shopeePartnerSession.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        merchantAccountFingerprint: true,
        lastSuccessfulPollAt: true,
        lastErrorCode: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
    prisma.shopeePartnerTransaction.findMany({
      include: {
        session: { select: { name: true } },
        qrisInvoiceAttempt: {
          select: {
            evidenceMode: true,
            order: { select: { invoiceNumber: true } },
            walletTopup: { select: { invoiceNumber: true } },
          },
        },
      },
      orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
      take: 100,
    }),
  ]);
  return (
    <AdminShell
      active="payments"
      counts={counts}
      description="Audit session polling, matching invoice, dan transaksi Shopee Partner. Matching web-session tidak mengonfirmasi pembayaran tanpa bukti transaksi terikat."
      email={admin.email}
      eyebrow="Shopee Partner ledger"
      title="Transaksi Shopee Partner"
    >
      <PaymentOperationsNav active="shopee" />
      <p><Link className="button button-small" href="/admin/payment-settings/shopee" prefetch={false}><Settings2 aria-hidden="true" size={16} /> Kelola session</Link></p>
      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">Polling sessions</p><h2>Status sumber bukti</h2></div></div>
        {sessions.length === 0 ? <p>Belum ada session Shopee Partner.</p> : (
          <div className="table-scroll"><table><thead><tr><th>Nama</th><th>Status</th><th>Akun</th><th>Poll sukses</th><th>Error aman</th></tr></thead><tbody>
            {sessions.map((session) => <tr key={session.id}><td>{session.name}</td><td>{session.status}</td><td><code>{shortFingerprint(session.merchantAccountFingerprint)}</code></td><td>{session.lastSuccessfulPollAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-"}</td><td>{session.lastErrorCode ?? "-"}</td></tr>)}
          </tbody></table></div>
        )}
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">Read-only evidence</p><h2>Transaksi diterima</h2></div><span className="status-pill status-neutral">{transactions.length} terbaru</span></div>
        {transactions.length === 0 ? <p>Belum ada transaksi ternormalisasi. Ini normal selama kontrak respons belum disetujui.</p> : (
          <div className="table-scroll"><table><thead><tr><th>Waktu</th><th>Session</th><th>ID transaksi</th><th>Nominal</th><th>Status</th><th>Invoice</th><th>Mode</th><th>Hash payload</th></tr></thead><tbody>
            {transactions.map((transaction) => <tr key={transaction.id}><td>{transaction.occurredAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td><td>{transaction.session.name}</td><td><code>{maskedTransactionId(transaction.externalTransactionId)}</code></td><td>{formatRupiah(transaction.amount)}</td><td>{transaction.status}</td><td>{transaction.qrisInvoiceAttempt?.order?.invoiceNumber ?? transaction.qrisInvoiceAttempt?.walletTopup?.invoiceNumber ?? "-"}</td><td>{transaction.qrisInvoiceAttempt?.evidenceMode ?? "-"}</td><td><code>{shortFingerprint(transaction.rawPayloadHash)}</code></td></tr>)}
          </tbody></table></div>
        )}
      </section>
    </AdminShell>
  );
}
