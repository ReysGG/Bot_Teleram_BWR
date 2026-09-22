import Link from "next/link";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { UsdtRateControl } from "@/components/admin/usdt-rate-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getUsdtRateSetting } from "@/server/payment/usdt-rate-setting";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function UsdtRateSettingPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, setting] = await Promise.all([getAdminInventoryCounts(), getUsdtRateSetting()]);
  return (
    <AdminShell active="paymentSettings" counts={counts} description="Edit kurs IDR per USDT yang dipakai saat membuat invoice crypto baru." email={admin.email} eyebrow="Payment pricing edit" title="Edit kurs USDT">
      {query.notice === "usdt_rate" ? <AdminResultModal message="Kurs USDT berhasil diperbarui. Invoice lama tidak berubah." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Kurs USDT tidak dapat disimpan. Gunakan bilangan bulat dalam rentang yang diizinkan." tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link></p>
      <UsdtRateControl rate={setting.rate} updatedAt={setting.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null} updatedBy={setting.updatedBy} />
    </AdminShell>
  );
}
