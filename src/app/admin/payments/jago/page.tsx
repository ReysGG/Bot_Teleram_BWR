import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { JagoTransferLedgerSection } from "@/components/admin/jago-transfer-ledger-section";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function JagoPaymentsPage({ searchParams }: { searchParams: Promise<{ jp?: string; jq?: string; js?: string; notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const counts = await getAdminInventoryCounts();
  return (
    <AdminShell active="payments" counts={counts} description="Riwayat transfer Bank Jago, event yang cocok, dan approval manual order aktif." email={admin.email} eyebrow="Bank Jago ledger" title="Transaksi Bank Jago">
      <PaymentOperationsNav active="jago" />
      {query.notice === "payment-confirmed" ? <AdminResultModal message="Pembayaran Bank Jago dikonfirmasi. Stok dan delivery diproses idempotent." tone="success" /> : null}
      {query.error ? <AdminResultModal message={query.error === "payment_expired" ? "Invoice sudah expired. Gunakan recovery wallet; jangan kirim produk melalui approval manual." : "Pembayaran tidak dapat dikonfirmasi dari status saat ini."} tone="error" /> : null}
      <p><Link className="button button-small" href="/admin/payment-settings/jago" prefetch={false}><Settings2 aria-hidden="true" size={16} /> Edit rekening & status</Link></p>
      <JagoTransferLedgerSection page={query.jp} search={query.jq} status={query.js} />
    </AdminShell>
  );
}
