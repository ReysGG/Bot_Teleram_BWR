import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  DeliveryLedger,
  DeliveryMetrics,
} from "@/components/admin/deliveries/delivery-ledger";
import { NotificationIssueLedger } from "@/components/admin/deliveries/notification-issue-ledger";
import {
  getAdminDeliveriesData,
  type AdminDeliveriesSearchParams,
} from "@/server/admin/deliveries";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({
  searchParams,
}: {
  searchParams: Promise<AdminDeliveriesSearchParams>;
}) {
  const admin = await requireAdminPage();
  const data = await getAdminDeliveriesData(await searchParams);
  const { counts, query } = data;

  return (
    <AdminShell
      active="deliveries"
      counts={counts}
      description="Lacak setiap file yang dialokasikan, produk asalnya, penerima Telegram, dan hasil pengiriman."
      email={admin.email}
      eyebrow="Fulfillment tracking"
      title="Tracking kiriman"
    >
      {query.notice === "retry-queued" ? (
        <AdminResultModal
          message={`${Number.parseInt(query.queued ?? "0", 10) || 0} pengiriman masuk antrean ulang. ${Number.parseInt(query.skipped ?? "0", 10) || 0} dilewati karena statusnya tidak aman.`}
          tone="success"
          title="Bulk retry selesai"
        />
      ) : null}
      {query.error === "retry-blocked" ? (
        <AdminResultModal
          message="Pilih minimal satu pengiriman gagal yang masih aman untuk dicoba ulang."
          tone="error"
          title="Bulk retry tidak diproses"
        />
      ) : null}

      <DeliveryMetrics {...data} />

      <p className="alert alert-success">
        Status API Telegram hanya membuktikan server Telegram menerima upload dan memberi message ID.
        Konfirmasi pembeli ditampilkan terpisah agar laporan tidak tercampur dengan hasil teknis.
      </p>

      <NotificationIssueLedger {...data} />

      <DeliveryLedger {...data} />
    </AdminShell>
  );
}
