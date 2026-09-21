import Link from "next/link";
import { Settings2 } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentOperationsNav } from "@/components/admin/payment-operations-nav";
import { QrisPaymentLedgerSection } from "@/components/admin/qris-payment-ledger-section";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function QrisPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    qp?: string;
    qq?: string;
    qs?: string;
    qt?: string;
    qv?: string;
    qo?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const counts = await getAdminInventoryCounts();
  return (
    <AdminShell
      active="payments"
      counts={counts}
      description="Audit invoice QRIS berdasarkan snapshot merchant, provider, mode bukti, package Android, nominal, status, dan target order atau top up wallet."
      email={admin.email}
      eyebrow="QRIS ledger"
      title="Transaksi QRIS"
    >
      <PaymentOperationsNav active="qris" />
      <p><Link className="button button-small" href="/admin/payment-settings/qris" prefetch={false}><Settings2 aria-hidden="true" size={16} /> Kelola merchant QRIS</Link></p>
      <QrisPaymentLedgerSection
        page={query.qp}
        provider={query.qv === "all" ? undefined : query.qv}
        search={query.qq}
        sort={query.qo}
        status={query.qs}
        target={query.qt}
      />
    </AdminShell>
  );
}
