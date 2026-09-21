import Link from "next/link";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { BinanceInternalSettingsControl } from "@/components/admin/binance-internal-settings-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function BinancePaymentSettingPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, setting] = await Promise.all([getAdminInventoryCounts(), getBinanceInternalSetting()]);
  return (
    <AdminShell active="paymentSettings" counts={counts} description="Edit Binance ID penerima dan pilih verifier internal. Web session terenkripsi dapat dipakai tanpa API key." email={admin.email} eyebrow="Payment provider edit" title="Edit Binance Pay">
      {query.notice === "binance_internal_settings" ? <AdminResultModal message="Konfigurasi Binance Pay berhasil disimpan. Invoice baru memakai Binance ID terbaru." tone="success" /> : null}
      {query.error ? <AdminResultModal message="Konfigurasi Binance Pay tidak dapat disimpan. Periksa Binance ID serta kesiapan API atau web session." tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link> <Link className="button button-small" href="/admin/payment-settings/binance-web" prefetch={false}>Kelola web session</Link> <Link className="button button-small" href="/admin/payments/binance" prefetch={false}>Buka riwayat Binance</Link></p>
      <BinanceInternalSettingsControl apiConfigured={setting.api.configured} enabled={setting.enabled} recipientId={setting.recipientId ?? ""} updatedAt={setting.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null} updatedBy={setting.updatedBy} verifierMode={setting.verifierMode} webAutoConfirmEnabled={setting.web.autoConfirmEnabled} webCheckoutEnabled={setting.web.checkoutEnabled} webSessionConfigured={Boolean(setting.web.sessionId)} webSessionReady={setting.web.ready} />
    </AdminShell>
  );
}
