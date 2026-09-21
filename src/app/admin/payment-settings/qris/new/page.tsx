import Link from "next/link";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { QrisMerchantForm } from "@/components/admin/qris-merchant-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { listAdminBridgeDeviceOptions } from "@/server/payment/bridge-device-options";
import { listActiveShopeePartnerSessionOptions } from "@/server/payment/shopee-partner-session";
import {
  isQrisProviderKey,
  listQrisProviderDefinitions,
} from "@/server/payment/qris-provider-registry";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_slug: "Slug merchant tidak valid. Gunakan huruf kecil, angka, dan tanda hubung.",
  invalid_name: "Nama merchant harus terdiri dari 2-100 karakter.",
  invalid_provider: "Provider QRIS belum didukung aplikasi.",
  invalid_static_payload: "Payload QRIS statis tidak valid atau CRC tidak cocok.",
  duplicate_slug: "Slug merchant sudah digunakan. Pilih slug lain.",
  invalid_device_id: "Device ID bridge tidak valid. Salin persis ID perangkat dari aplikasi Android.",
  trusted_device_required: "ShopeePay memerlukan Device ID Android sebelum dapat langsung diaktifkan.",
  shopee_device_not_registered: "Device ID ShopeePay belum pernah terdaftar melalui heartbeat aplikasi bridge.",
  shopee_bridge_version_unknown: "Versi aplikasi bridge pada Device ID ShopeePay belum dilaporkan. Tunggu heartbeat berikutnya.",
  shopee_bridge_unsupported: "Aplikasi bridge untuk ShopeePay harus versi 1.5.7 (versionCode 20) atau lebih baru.",
  shopee_session_invalid: "Session Shopee Partner belum aktif atau belum memiliki identitas akun tervalidasi.",
  shopee_account_required: "Merchant Shopee harus diikat ke session akun sebelum memakai mode web-session.",
  shopee_account_mismatch: "Session Shopee yang dipilih tidak cocok dengan binding akun merchant QRIS.",
  action_failed: "Merchant QRIS tidak dapat dibuat.",
};

export default async function NewQrisMerchantPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; provider?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, bridgeDevices, shopeeSessions] = await Promise.all([
    getAdminInventoryCounts(),
    listAdminBridgeDeviceOptions(),
    listActiveShopeePartnerSessionOptions(),
  ]);
  const providers = listQrisProviderDefinitions();
  const defaultProviderKey = query.provider && isQrisProviderKey(query.provider)
    ? query.provider
    : undefined;

  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Daftarkan satu QRIS statis, provider notifikasi, dan bila perlu binding akun Shopee untuk web-session. Payload mentah hanya digunakan saat penyimpanan dan tidak ditampilkan kembali."
      email={admin.email}
      eyebrow="QRIS merchant create"
      title="Tambah merchant QRIS"
    >
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? errorMessages.action_failed} tone="error" /> : null}
      <p><Link className="button button-small button-ghost" href="/admin/payment-settings/qris" prefetch={false}>Kembali ke merchant QRIS</Link></p>
      <QrisMerchantForm
        action="/api/admin/payment-settings/qris"
        bridgeDevices={bridgeDevices}
        defaultProviderKey={defaultProviderKey}
        mode="create"
        providers={providers}
        shopeeSessions={shopeeSessions.map((session) => ({
          ...session,
          lastValidatedAt: session.lastValidatedAt?.toISOString() ?? null,
        }))}
      />
    </AdminShell>
  );
}
