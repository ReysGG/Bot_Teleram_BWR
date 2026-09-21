import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { QrisMerchantAction } from "@/components/admin/qris-merchant-action";
import { QrisMerchantForm } from "@/components/admin/qris-merchant-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { listAdminBridgeDeviceOptions } from "@/server/payment/bridge-device-options";
import { listActiveShopeePartnerSessionOptions } from "@/server/payment/shopee-partner-session";
import {
  getQrisMerchant,
  qrisMerchantViewActivationReadiness,
} from "@/server/payment/qris-merchant-service";
import { listQrisProviderDefinitions } from "@/server/payment/qris-provider-registry";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_slug: "Slug merchant tidak valid.",
  invalid_name: "Nama merchant tidak valid.",
  invalid_provider: "Provider QRIS belum didukung.",
  invalid_static_payload: "Payload QRIS statis tidak valid atau CRC tidak cocok.",
  payload_unreadable: "Payload tersimpan tidak dapat dibaca. Tempel ulang payload statis yang valid.",
  merchant_not_found: "Merchant QRIS tidak ditemukan.",
  merchant_archived: "Merchant yang sudah diarsipkan tidak dapat diubah.",
  merchant_disabled: "Aktifkan merchant sebelum memilihnya untuk checkout.",
  provider_not_ready: "Provider QRIS belum siap digunakan.",
  provider_package_unknown: "Provider QRIS tidak memiliki package Android tepercaya.",
  invalid_device_id: "Device ID bridge tidak valid. Salin persis ID perangkat dari aplikasi Android.",
  trusted_device_required: "Provider non-relay memerlukan device ID Android tepercaya sebelum dapat diaktifkan.",
  shopee_device_not_registered: "Device ID ShopeePay belum pernah terdaftar melalui heartbeat aplikasi bridge.",
  shopee_bridge_version_unknown: "Versi aplikasi bridge pada Device ID ShopeePay belum dilaporkan. Tunggu heartbeat berikutnya.",
  shopee_bridge_unsupported: "Aplikasi bridge untuk ShopeePay harus versi 1.5.7 (versionCode 20) atau lebih baru.",
  shopee_session_invalid: "Session Shopee Partner belum aktif atau belum memiliki identitas akun tervalidasi.",
  shopee_account_required: "Merchant Shopee harus diikat ke session akun sebelum memakai mode web-session.",
  shopee_account_mismatch: "Session Shopee yang dipilih tidak cocok dengan binding akun merchant QRIS.",
  duplicate_slug: "Slug merchant sudah digunakan.",
  save_failed: "Konfigurasi merchant QRIS tidak dapat disimpan.",
  action_failed: "Tindakan merchant QRIS tidak dapat diproses.",
};

export default async function QrisMerchantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [counts, merchant, bridgeDevices, shopeeSessions] = await Promise.all([
    getAdminInventoryCounts(),
    getQrisMerchant(id),
    listAdminBridgeDeviceOptions(),
    listActiveShopeePartnerSessionOptions(),
  ]);
  if (!merchant) notFound();
  const providers = listQrisProviderDefinitions();
  const archived = Boolean(merchant.archivedAt);
  const activationReadiness = qrisMerchantViewActivationReadiness(merchant, bridgeDevices);
  const initialShopeeSessionId = merchant.shopeeAccountFingerprint
    ? shopeeSessions.find((session) => session.merchantAccountFingerprint === merchant.shopeeAccountFingerprint)?.id
    : undefined;
  const returnTo = `/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}`;

  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Edit identitas, provider, status, binding akun Shopee, atau ganti payload statis. Perubahan tidak pernah menulis ulang snapshot invoice lama."
      email={admin.email}
      eyebrow="QRIS merchant edit"
      title={merchant.name}
    >
      {query.notice === "qris_created" ? <AdminResultModal message="Merchant QRIS berhasil dibuat. Aktifkan statusnya, lalu pilih untuk checkout setelah provider siap." tone="success" /> : null}
      {query.notice === "qris_created_active" ? <AdminResultModal message="Merchant QRIS berhasil dibuat dan langsung dipakai untuk invoice baru. QRIS lama otomatis dimatikan." tone="success" /> : null}
      {query.notice === "qris_updated" ? <AdminResultModal message="Konfigurasi merchant QRIS berhasil diperbarui." tone="success" /> : null}
      {query.notice === "qris_activated" ? <AdminResultModal message="Merchant ini sekarang dipakai untuk invoice QRIS baru." tone="success" /> : null}
      {query.notice === "qris_archived" ? <AdminResultModal message="Merchant berhasil diarsipkan. Riwayat invoice tetap tersedia." tone="success" /> : null}
      {query.notice === "legacy_qris_imported" ? <AdminResultModal message="QRIS lama berhasil diimpor ke vault terenkripsi dan langsung dipilih untuk invoice baru. Fallback environment sudah dimatikan." tone="success" /> : null}
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? errorMessages.action_failed} tone="error" /> : null}

      <div className="admin-modal-actions qris-page-nav">
        <Link className="button button-small button-ghost" href="/admin/payment-settings/qris" prefetch={false}>Kembali ke merchant</Link>
        <Link className="button button-small button-ghost" href="/admin/payments/qris" prefetch={false}>Buka riwayat QRIS</Link>
        {!merchant.isActive && !archived ? (
          <QrisMerchantAction
            action={`/api/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}/activate`}
            disabled={!merchant.enabled || !activationReadiness.canActivate}
            disabledReason={!merchant.enabled ? "Merchant masih nonaktif" : activationReadiness.reason}
            kind="activate"
            merchantName={merchant.name}
            returnTo={returnTo}
          />
        ) : null}
        {!archived ? (
          <QrisMerchantAction
            action={`/api/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}/archive`}
            kind="archive"
            merchantName={merchant.name}
            returnTo={returnTo}
          />
        ) : null}
      </div>

      {archived ? (
        <p className="alert alert-error">Merchant ini sudah diarsipkan {merchant.archivedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}. Payload dan riwayat dipertahankan, tetapi konfigurasi tidak dapat diedit.</p>
      ) : (
        <QrisMerchantForm
          action={`/api/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}`}
          bridgeDevices={bridgeDevices}
          initialValue={{
            enabled: merchant.enabled,
            name: merchant.name,
            payloadFingerprint: merchant.payloadFingerprint,
            providerKey: merchant.providerKey,
            slug: merchant.slug,
            trustedDeviceId: merchant.trustedDeviceId,
            shopeeAccountFingerprint: merchant.shopeeAccountFingerprint,
          }}
          initialShopeeSessionId={initialShopeeSessionId}
          mode="edit"
          providers={providers}
          shopeeSessions={shopeeSessions.map((session) => ({
            ...session,
            lastValidatedAt: session.lastValidatedAt?.toISOString() ?? null,
          }))}
        />
      )}
    </AdminShell>
  );
}
