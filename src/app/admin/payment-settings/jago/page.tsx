import Link from "next/link";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { JagoTransferSettingsControl } from "@/components/admin/jago-transfer-settings-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function JagoPaymentSettingPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, setting] = await Promise.all([getAdminInventoryCounts(), getJagoTransferSetting()]);
  return (
    <AdminShell active="paymentSettings" counts={counts} description="Edit rekening tujuan Bank Jago. Status aktif/nonaktif tetap dikelola dari switch pusat." email={admin.email} eyebrow="Payment provider edit" title="Edit Bank Jago">
      {query.notice === "jago_transfer_settings" ? <AdminResultModal message="Konfigurasi Bank Jago berhasil disimpan. Invoice lama tetap memakai snapshot rekening sebelumnya." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Konfigurasi Bank Jago tidak dapat disimpan. Periksa nomor rekening penerima." tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link> <Link className="button button-small" href="/admin/payments/jago" prefetch={false}>Buka riwayat Jago</Link></p>
      <JagoTransferSettingsControl accountNumber={setting.accountNumber ?? ""} enabled={setting.enabled} updatedAt={setting.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null} updatedBy={setting.updatedBy} />
    </AdminShell>
  );
}
