import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { BinanceInternalLedgerSection } from "@/components/admin/binance-internal-ledger-section";
import { BinanceWebTransactionLedger } from "@/components/admin/binance-web-transaction-ledger";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function BinancePaymentsPage({ searchParams }: { searchParams: Promise<{ bp?: string; bq?: string; bs?: string; wp?: string; wq?: string; ws?: string; notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const counts = await getAdminInventoryCounts();
  return (
    <AdminShell active="payments" counts={counts} description="Riwayat Order ID Binance Pay dan bukti dari web session terenkripsi atau API read-only." email={admin.email} eyebrow="Binance Pay ledger" title="Transaksi Binance Pay">
      <PaymentOperationsNav active="binance" />
      {query.notice === "binance_internal_rechecked" ? <AdminResultModal message="Histori transaksi Binance selesai diperiksa ulang tanpa melewati verifier." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Transaksi Binance belum dapat diperiksa ulang. Status order tidak diubah." tone="error" /> : null}
      <p><Link className="button button-small" href="/admin/payment-settings/binance" prefetch={false}><Settings2 aria-hidden="true" size={16} /> Edit Binance Pay</Link> <Link className="button button-small button-ghost" href="/admin/payment-settings/binance-web" prefetch={false}>Kelola web session</Link></p>
      <BinanceWebTransactionLedger page={query.wp} search={query.wq} status={query.ws} />
      <BinanceInternalLedgerSection page={query.bp} search={query.bq} status={query.bs} />
    </AdminShell>
  );
}
