import Link from "next/link";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { UsdtBep20SettingsControl } from "@/components/admin/usdt-bep20-settings-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getUsdtBep20Setting } from "@/server/payment/usdt-bep20-setting";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function UsdtBep20SettingPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, setting] = await Promise.all([getAdminInventoryCounts(), getUsdtBep20Setting()]);
  const rpcMode = setting.rpc.source === "ENV" ? "environment" : setting.rpc.url ? "default" : "unavailable";
  return (
    <AdminShell active="paymentSettings" counts={counts} description="Edit alamat penerima dan minimum konfirmasi blockchain. Tidak ada jalur approval manual." email={admin.email} eyebrow="Payment provider edit" title="Edit USDT BEP20">
      {query.notice === "usdt_bep20_settings" ? <AdminResultModal message="Konfigurasi USDT BEP20 berhasil disimpan. Invoice lama tetap memakai snapshot sebelumnya." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Konfigurasi USDT BEP20 tidak dapat disimpan. Periksa alamat dan jumlah konfirmasi." tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link> <Link className="button button-small" href="/admin/payments/usdt-bep20" prefetch={false}>Buka riwayat BEP20</Link></p>
      <UsdtBep20SettingsControl enabled={setting.enabled} minimumConfirmations={setting.requiredConfirmations} recipientAddress={setting.recipientAddress ?? ""} rpcMode={rpcMode} tokenContract={setting.tokenContract} updatedAt={setting.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null} updatedBy={setting.updatedBy} />
    </AdminShell>
  );
}
