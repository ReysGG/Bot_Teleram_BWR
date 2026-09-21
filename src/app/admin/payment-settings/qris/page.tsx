import Link from "next/link";
import {
  Fingerprint,
  Plus,
  QrCode,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { QrisLegacyAction } from "@/components/admin/qris-legacy-action";
import { QrisMerchantAction } from "@/components/admin/qris-merchant-action";
import { QrisSourceCard } from "@/components/admin/qris-source-card";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { listAdminBridgeDeviceOptions } from "@/server/payment/bridge-device-options";
import {
  listQrisMerchants,
  qrisMerchantViewActivationReadiness,
  resolveQrisCheckoutMerchant,
  type QrisMerchantView,
} from "@/server/payment/qris-merchant-service";
import { getLegacyQrisFallbackStatus } from "@/server/payment/qris-legacy-service";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

const errorMessages: Record<string, string> = {
  invalid_slug: "Slug merchant tidak valid. Gunakan huruf kecil, angka, dan tanda hubung.",
  invalid_name: "Nama merchant harus terdiri dari 2-100 karakter.",
  invalid_provider: "Provider QRIS belum didukung aplikasi.",
  invalid_static_payload: "Payload QRIS statis tidak valid atau CRC tidak cocok.",
  payload_unreadable: "Payload tersimpan tidak dapat dibaca. Ganti payload sebelum mengaktifkan merchant.",
  merchant_not_found: "Merchant QRIS tidak ditemukan.",
  merchant_archived: "Merchant QRIS sudah diarsipkan dan tidak dapat diubah.",
  merchant_disabled: "Aktifkan merchant terlebih dahulu sebelum memilihnya untuk checkout.",
  provider_not_ready: "Provider QRIS belum siap digunakan.",
  provider_package_unknown: "Provider QRIS tidak memiliki package Android tepercaya.",
  invalid_device_id: "Device ID bridge tidak valid. Salin persis ID perangkat dari aplikasi Android.",
  trusted_device_required: "ShopeePay / Shopee Partner memerlukan Device ID Android tepercaya sebelum dapat dipilih.",
  shopee_device_not_registered: "Device ID ShopeePay belum pernah terdaftar melalui heartbeat aplikasi bridge.",
  shopee_bridge_version_unknown: "Versi aplikasi bridge pada Device ID ShopeePay belum dilaporkan. Tunggu heartbeat berikutnya.",
  shopee_bridge_unsupported: "Aplikasi bridge untuk ShopeePay harus versi 1.5.7 (versionCode 20) atau lebih baru.",
  duplicate_slug: "Slug merchant sudah digunakan. Pilih slug lain.",
  save_failed: "Konfigurasi merchant QRIS tidak dapat disimpan.",
  action_failed: "Tindakan merchant QRIS tidak dapat diproses.",
  legacy_payload_missing: "Payload QRIS lama belum tersedia di environment server.",
  legacy_payload_invalid: "Payload QRIS lama tidak valid atau CRC-nya tidak cocok.",
  legacy_device_ambiguous: "Impor ditolak karena environment berisi lebih dari satu Device ID. Sisakan satu Device ID terlebih dahulu.",
};

function shortFingerprint(value: string) {
  return `${value.slice(0, 10)}...${value.slice(-10)}`;
}

function providerLabel(merchant: Pick<QrisMerchantView, "providerKey">) {
  return merchant.providerKey === "SHOPEE_PARTNER"
    ? "ShopeePay / Shopee Partner"
    : "DANA";
}

function merchantDescription(merchant: QrisMerchantView) {
  if (merchant.providerKey === "SHOPEE_PARTNER") {
    return merchant.shopeeAccountFingerprint
      ? "QRIS ShopeePay dengan binding akun tervalidasi untuk notifikasi Android dan opsi web-session."
      : "QRIS ShopeePay yang dikonfirmasi dari notifikasi aplikasi Shopee Partner pada HP bridge tepercaya; web-session belum diikat.";
  }
  return merchant.trustedDeviceId
    ? "QRIS DANA vault yang menerima relay dan notifikasi Android dari HP bridge tepercaya."
    : "QRIS DANA vault dengan konfirmasi melalui neutral DANA relay.";
}

export default async function QrisPaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, merchants, legacy, bridgeDevices] = await Promise.all([
    getAdminInventoryCounts(),
    listQrisMerchants(),
    getLegacyQrisFallbackStatus(),
    listAdminBridgeDeviceOptions(),
  ]);
  const checkoutMerchant = await resolveQrisCheckoutMerchant();
  const legacyFallbackActive = checkoutMerchant?.source === "ENV";
  const activeMerchant = merchants.find((merchant) => merchant.isActive && !merchant.archivedAt) ?? null;
  const availableMerchants = merchants.filter((merchant) => !merchant.archivedAt);
  const archivedMerchants = merchants.filter((merchant) => merchant.archivedAt);
  const readyCount = availableMerchants.filter((merchant) => {
    const readiness = qrisMerchantViewActivationReadiness(merchant, bridgeDevices);
    return merchant.enabled && readiness.canActivate;
  }).length + Number(legacy.valid);
  const hasDanaVault = availableMerchants.some((merchant) => merchant.providerKey === "DANA");
  const hasShopeeVault = availableMerchants.some((merchant) => merchant.providerKey === "SHOPEE_PARTNER");
  const activeSourceName = activeMerchant?.name ?? (legacyFallbackActive ? "DANA lama (environment)" : "Belum dipilih");
  const activeSourceProvider = activeMerchant ? providerLabel(activeMerchant) : legacyFallbackActive ? "DANA" : "QRIS tidak tersedia";

  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Upload QRIS DANA atau ShopeePay, lalu pilih satu sumber untuk seluruh invoice baru. Pergantian sumber tidak mengubah invoice yang sudah dibuat."
      email={admin.email}
      eyebrow="QRIS invoice routing"
      title="Pilih QRIS checkout"
    >
      {query.notice === "qris_created" ? <AdminResultModal message="Merchant QRIS berhasil dibuat. Pilih kartunya saat ingin memakainya untuk invoice baru." tone="success" /> : null}
      {query.notice === "qris_created_active" ? <AdminResultModal message="Merchant QRIS berhasil dibuat dan langsung dipilih untuk invoice baru." tone="success" /> : null}
      {query.notice === "qris_updated" ? <AdminResultModal message="Konfigurasi merchant QRIS berhasil diperbarui. Invoice lama tidak berubah." tone="success" /> : null}
      {query.notice === "qris_activated" ? <AdminResultModal message="Pilihan QRIS untuk invoice baru berhasil diganti. Snapshot invoice lama tetap aman." tone="success" /> : null}
      {query.notice === "qris_archived" ? <AdminResultModal message="Merchant QRIS berhasil diarsipkan. Riwayat dan snapshot invoice tetap dipertahankan." tone="success" /> : null}
      {query.notice === "legacy_qris_selected" ? <AdminResultModal message="QRIS DANA lama sekarang dipilih untuk invoice baru. Merchant vault sebelumnya sudah dilepas secara aman." tone="success" /> : null}
      {query.notice === "legacy_qris_disabled" ? <AdminResultModal message="QRIS DANA lama dimatikan. Invoice yang sudah dibuat tidak berubah." tone="success" /> : null}
      {query.error ? <AdminResultModal message={errorMessages[query.error] ?? errorMessages.action_failed} tone="error" /> : null}

      <div className="admin-modal-actions qris-page-nav">
        <Link className="button button-small button-ghost" href="/admin/payment-settings" prefetch={false}>Kembali ke metode</Link>
        <Link className="button button-small button-ghost" href="/admin/payments/qris" prefetch={false}>Buka riwayat QRIS</Link>
        <Link className="button button-small" href="/admin/payment-settings/qris/new?provider=DANA" prefetch={false}><Plus aria-hidden="true" size={16} /> Tambah DANA</Link>
        <Link className="button button-small button-primary" href="/admin/payment-settings/qris/new?provider=SHOPEE_PARTNER" prefetch={false}><Plus aria-hidden="true" size={16} /> Tambah ShopeePay</Link>
      </div>

      <section className={`panel wide-panel qris-active-source${checkoutMerchant ? " is-ready" : ""}`}>
        <div className="qris-active-source-icon"><QrCode aria-hidden="true" size={28} /></div>
        <div>
          <p className="eyebrow">Dipakai untuk invoice baru</p>
          <h2>{activeSourceName}</h2>
          <p>{activeSourceProvider}. Hanya sumber ini yang dipakai saat checkout membuat QRIS baru.</p>
        </div>
        <span className={`status-pill ${checkoutMerchant ? "status-good" : "status-bad"}`}>
          {checkoutMerchant ? "Aktif" : "Belum ada QRIS aktif"}
        </span>
      </section>

      <p className="alert alert-success qris-provider-safety">
        <Smartphone aria-hidden="true" size={19} />
        <span><strong>Satu HP, satu Device ID.</strong> Jika DANA dan Shopee Partner berjalan di HP bridge yang sama, gunakan Device ID yang sama pada kedua merchant. Sistem tetap membedakan pembayaran dari package aplikasinya.</span>
      </p>

      <section className="panel wide-panel qris-source-selector-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><QrCode aria-hidden="true" /></span>
            <div><p className="eyebrow">Satu pilihan aktif</p><h2>Pilih DANA atau ShopeePay</h2></div>
          </div>
          <span className="status-pill status-neutral">{readyCount} sumber siap</span>
        </div>
        <p className="qris-source-selector-intro">
          Kartu dengan lingkaran terisi adalah QRIS yang dipakai checkout. Tombol pilihan selalu membuka konfirmasi sebelum routing invoice diubah.
        </p>

        <div aria-label="Pilihan sumber QRIS untuk invoice baru" className="qris-source-grid">
          <QrisSourceCard
            active={legacyFallbackActive}
            actions={(
              <>
                {!legacyFallbackActive ? <QrisLegacyAction disabled={!legacy.valid} kind="use" /> : null}
                {legacy.enabled ? <QrisLegacyAction kind="disable" /> : null}
                <QrisLegacyAction disabled={!legacy.valid} kind="import" />
              </>
            )}
            description="QRIS DANA lama dari environment. Sumber ini tetap terlihat dan dapat dipilih, dimatikan, atau dipindahkan ke vault terenkripsi."
            disabled={!legacy.valid}
            facts={[
              { label: "Penyimpanan", value: "Environment lama" },
              { label: "Payload", value: legacy.valid ? "Valid" : legacy.configured ? "Tidak valid" : "Belum tersedia" },
              { label: "Device bridge", value: `${legacy.allowedDeviceCount} terdaftar` },
              { label: "Fingerprint", value: legacy.fingerprint ? <code title={legacy.fingerprint}>{shortFingerprint(legacy.fingerprint)}</code> : "-" },
            ]}
            name="DANA lama (environment)"
            providerLabel="DANA"
            statusLabel={legacyFallbackActive ? "Dipilih" : legacy.valid ? legacy.enabled ? "Tersedia" : "Dimatikan" : "Tidak siap"}
            warning={legacy.blockedByActiveMerchant ? <>Sumber ini tidak mengambil alih karena <strong>{legacy.activeMerchantName}</strong> sedang dipilih.</> : undefined}
          />

          {availableMerchants.map((merchant) => {
            const readiness = qrisMerchantViewActivationReadiness(merchant, bridgeDevices);
            const canActivate = merchant.enabled && readiness.canActivate;
            const disabledReason = !merchant.enabled
              ? "Merchant masih nonaktif"
              : readiness.reason;
            return (
              <QrisSourceCard
                active={merchant.isActive}
                actions={(
                  <>
                    <Link className="button button-small" href={`/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}`} prefetch={false}>Edit QRIS</Link>
                    {!merchant.isActive ? (
                      <QrisMerchantAction
                        action={`/api/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}/activate`}
                        disabled={!canActivate}
                        disabledReason={disabledReason}
                        kind="activate"
                        merchantName={merchant.name}
                        returnTo="/admin/payment-settings/qris"
                      />
                    ) : null}
                  </>
                )}
                description={merchantDescription(merchant)}
                disabled={!canActivate && !merchant.isActive}
                facts={[
                  { label: "Mode konfirmasi", value: merchant.usesDanaRelay ? merchant.trustedDeviceId ? "Relay + Android" : "DANA relay" : "Android bridge" },
                  { label: "Device bridge", value: merchant.trustedDeviceId ?? (merchant.usesDanaRelay ? "Tidak wajib untuk relay" : "Belum diisi") },
                  { label: "Package", value: merchant.trustedPackageNames.join(", ") || "Belum diverifikasi" },
                  ...(merchant.providerKey === "SHOPEE_PARTNER"
                    ? [{ label: "Binding web-session", value: merchant.shopeeAccountFingerprint ? <code title={merchant.shopeeAccountFingerprint}>{shortFingerprint(merchant.shopeeAccountFingerprint)}</code> : "Belum diikat" }]
                    : []),
                  { label: "Fingerprint", value: <><Fingerprint aria-hidden="true" size={14} /><code title={merchant.payloadFingerprint}>{shortFingerprint(merchant.payloadFingerprint)}</code></> },
                ]}
                key={merchant.id}
                name={merchant.name}
                providerLabel={providerLabel(merchant)}
                statusLabel={merchant.isActive ? readiness.canActivate ? "Dipilih" : "Dipilih, bridge belum siap" : canActivate ? "Siap dipilih" : merchant.enabled ? "Belum lengkap" : "Nonaktif"}
                warning={!merchant.enabled ? <><ShieldAlert aria-hidden="true" size={16} /> Merchant masih nonaktif</> : !readiness.canActivate ? <><ShieldAlert aria-hidden="true" size={16} /> {readiness.reason}</> : <><ShieldCheck aria-hidden="true" size={16} /> Provider dan routing sumber ini siap.</>}
              />
            );
          })}

          {!hasDanaVault ? (
            <article className="qris-source-empty-card">
              <span className="qris-source-provider">DANA vault</span>
              <h3>Belum ada QRIS DANA di vault</h3>
              <p>Upload gambar QRIS DANA agar payload tersimpan terenkripsi dan dapat dikelola tanpa mengubah environment.</p>
              <Link className="button button-small" href="/admin/payment-settings/qris/new?provider=DANA" prefetch={false}><Plus aria-hidden="true" size={16} /> Upload QRIS DANA</Link>
            </article>
          ) : null}

          {!hasShopeeVault ? (
            <article className="qris-source-empty-card is-shopee">
              <span className="qris-source-provider">ShopeePay / Shopee Partner</span>
              <h3>Belum ada QRIS ShopeePay</h3>
              <p>Upload gambar QRIS ShopeePay, lalu isi Device ID yang sama dengan aplikasi bridge di HP merchant ini.</p>
              <Link className="button button-small button-primary" href="/admin/payment-settings/qris/new?provider=SHOPEE_PARTNER" prefetch={false}><Plus aria-hidden="true" size={16} /> Upload QRIS ShopeePay</Link>
            </article>
          ) : null}
        </div>
      </section>

      {archivedMerchants.length > 0 ? (
        <section className="panel wide-panel qris-archived-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Tidak ikut checkout</p><h2>Merchant diarsipkan</h2></div>
            <span className="status-pill status-neutral">{archivedMerchants.length}</span>
          </div>
          <div className="qris-archived-list">
            {archivedMerchants.map((merchant) => (
              <Link href={`/admin/payment-settings/qris/${encodeURIComponent(merchant.id)}`} prefetch={false} key={merchant.id}>
                <span><strong>{merchant.name}</strong><small>{providerLabel(merchant)}</small></span>
                <span>Lihat detail</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
