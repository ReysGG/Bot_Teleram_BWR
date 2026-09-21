import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Landmark,
  Plus,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { PaymentMethodAvailabilityControl } from "@/components/admin/payment-method-availability-control";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { getBinanceInternalSetting } from "@/server/payment/binance-internal-setting";
import { getJagoTransferSetting } from "@/server/payment/jago-transfer-setting";
import { getPaymentMethodAvailability } from "@/server/payment/method-availability";
import { qrisCheckoutReady } from "@/server/payment/qris-invoice";
import { getActiveQrisMerchant } from "@/server/payment/qris-merchant-service";
import { getUsdtBep20Setting } from "@/server/payment/usdt-bep20-setting";
import { requireAdminPage } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";

export const dynamic = "force-dynamic";

type ProviderSummary = {
  label: string;
  description: string;
  enabled: boolean;
  ready: boolean;
  icon: typeof CreditCard;
  settingsHref: string;
  settingsLabel: string;
  historyHref: string;
};

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const [counts, paymentMethods, binance, jago, usdt, activeQrisMerchant, qrisReady] = await Promise.all([
    getAdminInventoryCounts(),
    getPaymentMethodAvailability(prisma, { configuredOnly: true }),
    getBinanceInternalSetting(),
    getJagoTransferSetting(),
    getUsdtBep20Setting(),
    getActiveQrisMerchant(),
    qrisCheckoutReady(),
  ]);
  const binanceReady = Boolean(binance.recipientId && binance.verifierReady);
  const jagoReady = Boolean(jago.accountNumber);
  const usdtReady = Boolean(usdt.recipientAddress && usdt.rpc.url);
  const summaries: ProviderSummary[] = [
    {
      label: "Bank Jago",
      description: "Rekening tujuan harus tersedia sebelum metode dapat diaktifkan.",
      enabled: paymentMethods.jagoTransferEnabled,
      ready: jagoReady,
      icon: Landmark,
      settingsHref: "/admin/payment-settings/jago",
      settingsLabel: "Edit rekening",
      historyHref: "/admin/payments/jago",
    },
    {
      label: "Binance Pay",
      description: `Memerlukan Binance ID dan verifier siap. Saat ini: ${binance.verifierMode === "WEB_SESSION" ? "web session" : binance.verifierMode === "OFFICIAL_API" ? "API read-only" : "belum tersedia"}.`,
      enabled: paymentMethods.binanceInternalEnabled,
      ready: binanceReady,
      icon: ShieldCheck,
      settingsHref: "/admin/payment-settings/binance",
      settingsLabel: "Edit Binance",
      historyHref: "/admin/payments/binance",
    },
    {
      label: "USDT BEP20",
      description: "Memerlukan alamat penerima dan koneksi RPC BSC.",
      enabled: paymentMethods.usdtBep20Enabled,
      ready: usdtReady,
      icon: CreditCard,
      settingsHref: "/admin/payment-settings/usdt-bep20",
      settingsLabel: "Edit wallet",
      historyHref: "/admin/payments/usdt-bep20",
    },
  ];
  const qrisEffective = paymentMethods.qrisDanaEnabled && qrisReady && !paymentMethods.qrisUnavailableReason;
  const qrisStatus = qrisEffective
    ? "Aktif di checkout"
    : paymentMethods.qrisUnavailableReason ? "Dihentikan otomatis"
    : paymentMethods.qrisDanaEnabled
      ? "Perlu setup"
      : "Switch nonaktif";
  const activeQrisProvider = activeQrisMerchant?.providerKey === "SHOPEE_PARTNER"
    ? "ShopeePay / Shopee Partner"
    : qrisReady
      ? "DANA"
      : "Belum dipilih";
  const qrisTitle = `Aktif: ${activeQrisProvider}`;
  const qrisDescription = activeQrisMerchant
    ? `${activeQrisMerchant.name} dipilih untuk seluruh invoice QRIS baru. Invoice lama tetap memakai snapshot merchant sebelumnya.`
    : qrisReady
      ? "QRIS DANA lama masih dipakai. Buka pemilih QRIS untuk mengganti ke DANA vault atau ShopeePay tanpa mengubah invoice lama."
      : "Tambahkan merchant QRIS, lengkapi provider dan Device ID jika diperlukan, lalu pilih sebagai merchant checkout.";

  return (
    <AdminShell
      active="paymentSettings"
      counts={counts}
      description="Tentukan metode yang terlihat di Telegram dan diizinkan backend untuk checkout baru. Invoice lama tetap mengikuti snapshot saat dibuat."
      email={admin.email}
      eyebrow="Payment settings"
      title="Metode pembayaran"
    >
      {query.notice === "payment_methods" ? (
        <AdminResultModal
          message="Metode pembayaran berhasil diperbarui. Pilihan Telegram dan guard backend untuk checkout baru sudah mengikuti setting ini."
          tone="success"
        />
      ) : null}
      {query.error === "payment_methods" ? (
        <AdminResultModal
          message="Metode pembayaran tidak dapat disimpan. Periksa dependency wallet dan kesiapan minimal satu provider top up (QRIS/DANA atau Bank Jago)."
          tone="error"
        />
      ) : null}

      <PaymentMethodAvailabilityControl
        readiness={{
          binanceInternalReady: binanceReady,
          jagoTransferReady: jagoReady,
          qrisMerchantReady: qrisReady,
          usdtBep20Ready: usdtReady,
        }}
        returnTo="/admin/payment-settings"
        updatedAt={paymentMethods.updatedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? null}
        updatedBy={paymentMethods.updatedBy}
        values={{
          binanceInternalEnabled: paymentMethods.binanceInternalEnabled,
          jagoTransferEnabled: paymentMethods.jagoTransferEnabled,
          mixedWalletQrisEnabled: paymentMethods.mixedWalletQrisEnabled,
          qrisDanaEnabled: paymentMethods.qrisDanaEnabled,
          usdtBep20Enabled: paymentMethods.usdtBep20Enabled,
          walletCheckoutEnabled: paymentMethods.walletCheckoutEnabled,
          walletTopupEnabled: paymentMethods.walletTopupEnabled,
        }}
      />

      <section className={`panel wide-panel payment-qris-focus ${qrisEffective ? "is-ready" : "is-inactive"}`}>
        <div className="payment-qris-focus-heading">
          <span className="payment-qris-focus-icon"><QrCode aria-hidden="true" size={25} /></span>
          <div>
            <p className="eyebrow">QRIS untuk invoice baru</p>
            <h2>{qrisTitle}</h2>
          </div>
          <span className={`status-pill ${qrisEffective ? "status-good" : paymentMethods.qrisDanaEnabled ? "status-bad" : "status-neutral"}`}>
            {qrisStatus}
          </span>
        </div>
        <p className="payment-qris-focus-description">{qrisDescription}</p>
        <div className="admin-modal-actions payment-qris-focus-actions">
          <Link className="button button-primary" href="/admin/payment-settings/qris" prefetch={false}>
            Pilih QRIS
            <ArrowRight aria-hidden="true" size={16} />
          </Link>
          <Link className="button button-ghost" href="/admin/payment-settings/qris/new?provider=SHOPEE_PARTNER" prefetch={false}>
            <Plus aria-hidden="true" size={16} /> Tambah ShopeePay
          </Link>
          <Link className="button button-ghost" href="/admin/payment-settings/shopee" prefetch={false}>
            Kelola session Shopee
          </Link>
          <Link className="button button-ghost" href="/admin/payments/qris" prefetch={false}>
            Riwayat pembayaran
          </Link>
        </div>
      </section>

      <section className="panel wide-panel payment-provider-summary">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Provider readiness</p>
            <h2>Konfigurasi provider lain</h2>
          </div>
          <Link className="button button-small" href="/admin/payment-settings/usdt-rate" prefetch={false}>
            Edit kurs USDT <ArrowRight aria-hidden="true" size={16} />
          </Link>
        </div>
        <p className="payment-method-intro">
          Switch metode tetap berada di panel atas. Bagian ini hanya untuk rekening, API, wallet tujuan, dan riwayat provider eksternal.
        </p>
        <div className="payment-provider-grid">
          {summaries.map((provider) => {
            const Icon = provider.icon;
            const effective = provider.enabled && provider.ready;
            return (
              <article className={`payment-provider-card ${effective ? "is-ready" : "is-inactive"}`} key={provider.label}>
                <span className="payment-provider-icon"><Icon aria-hidden="true" size={19} /></span>
                <div>
                  <strong>{provider.label}</strong>
                  <p>{provider.description}</p>
                </div>
                <span className={`status-pill ${effective ? "status-good" : provider.enabled ? "status-bad" : "status-neutral"}`}>
                  {effective ? "Aktif" : provider.enabled ? "Perlu config" : "Nonaktif"}
                </span>
                <div className="admin-modal-actions">
                  <Link className="button button-small" href={provider.settingsHref} prefetch={false}>{provider.settingsLabel}</Link>
                  <Link className="button button-small button-ghost" href={provider.historyHref} prefetch={false}>Riwayat</Link>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AdminShell>
  );
}
