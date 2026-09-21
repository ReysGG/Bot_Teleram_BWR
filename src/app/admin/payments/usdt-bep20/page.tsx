import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { UsdtBep20LedgerSection } from "@/components/admin/usdt-bep20-ledger-section";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function UsdtBep20PaymentsPage({ searchParams }: { searchParams: Promise<{ up?: string; uq?: string; us?: string; notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const counts = await getAdminInventoryCounts();
  return (
    <AdminShell active="payments" counts={counts} description="Riwayat transaksi on-chain, tx hash, dan konfirmasi jaringan BSC." email={admin.email} eyebrow="USDT BEP20 ledger" title="Transaksi USDT BEP20">
      <PaymentOperationsNav active="usdt-bep20" />
      {query.notice === "usdt_bep20_rechecked" ? <AdminResultModal message="Verifier on-chain selesai dijalankan ulang. Status terbaru sudah tercatat." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Transaksi belum dapat diperiksa ulang. Status order tidak diubah." tone="error" /> : null}
      <p><Link className="button button-small" href="/admin/payment-settings/usdt-bep20" prefetch={false}><Settings2 aria-hidden="true" size={16} /> Edit USDT BEP20</Link></p>
      <UsdtBep20LedgerSection page={query.up} search={query.uq} status={query.us} />
    </AdminShell>
  );
}
