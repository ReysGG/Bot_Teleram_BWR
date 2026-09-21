"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  Banknote,
  CreditCard,
  Landmark,
  Save,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  WalletCards,
  X,
} from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

type MethodKey =
  | "qrisDanaEnabled"
  | "walletCheckoutEnabled"
  | "mixedWalletQrisEnabled"
  | "walletTopupEnabled"
  | "jagoTransferEnabled"
  | "binanceInternalEnabled"
  | "usdtBep20Enabled";

type MethodValues = Record<MethodKey, boolean>;

type MethodReadiness = {
  qrisMerchantReady: boolean;
  jagoTransferReady: boolean;
  binanceInternalReady: boolean;
  usdtBep20Ready: boolean;
};

export function normalizeMethodValues(values: MethodValues): MethodValues {
  return {
    ...values,
    mixedWalletQrisEnabled:
      values.mixedWalletQrisEnabled &&
      values.walletCheckoutEnabled &&
      values.qrisDanaEnabled,
    walletTopupEnabled:
      values.walletTopupEnabled &&
      values.walletCheckoutEnabled &&
      (values.qrisDanaEnabled || values.jagoTransferEnabled),
  };
}

const METHOD_DEFINITIONS: Array<{
  key: MethodKey;
  label: string;
  description: string;
  icon: typeof CreditCard;
}> = [
  {
    key: "qrisDanaEnabled",
    label: "QRIS",
    description: "Invoice Rupiah dinamis dari merchant aktif dan package notifikasi tepercaya.",
    icon: Smartphone,
  },
  {
    key: "walletCheckoutEnabled",
    label: "Wallet checkout",
    description: "Saldo wallet untuk produk digital dan pembelian nomor SMS.",
    icon: WalletCards,
  },
  {
    key: "mixedWalletQrisEnabled",
    label: "Wallet + QRIS",
    description: "Potong saldo dahulu, lalu bayar kekurangannya melalui QRIS.",
    icon: CreditCard,
  },
  {
    key: "walletTopupEnabled",
    label: "Top up wallet",
    description: "Pembuatan invoice baru untuk menambah saldo wallet.",
    icon: Banknote,
  },
  {
    key: "jagoTransferEnabled",
    label: "Bank Jago",
    description: "Transfer rekening dengan verifikasi notifikasi Android bridge.",
    icon: Landmark,
  },
  {
    key: "binanceInternalEnabled",
    label: "Binance Pay",
    description: "Transfer internal USDT dengan Order ID dan verifier web/API.",
    icon: ShieldCheck,
  },
  {
    key: "usdtBep20Enabled",
    label: "USDT BEP20",
    description: "Transfer on-chain BSC ke alamat penerima yang dikonfigurasi.",
    icon: CreditCard,
  },
];

function readinessFor(key: MethodKey, readiness: MethodReadiness) {
  if (key === "qrisDanaEnabled") return readiness.qrisMerchantReady;
  if (key === "jagoTransferEnabled") return readiness.jagoTransferReady;
  if (key === "binanceInternalEnabled") return readiness.binanceInternalReady;
  if (key === "usdtBep20Enabled") return readiness.usdtBep20Ready;
  return true;
}

export function PaymentMethodAvailabilityControl({
  values: initialValues,
  readiness,
  updatedAt,
  updatedBy,
  returnTo = "/admin/payment-settings",
}: {
  values: MethodValues;
  readiness: MethodReadiness;
  updatedAt: string | null;
  updatedBy: string | null;
  returnTo?: "/admin/payment-settings";
}) {
  const [values, setValues] = useState(() => normalizeMethodValues(initialValues));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const changedMethods = useMemo(
    () => METHOD_DEFINITIONS.filter((method) => values[method.key] !== initialValues[method.key]),
    [initialValues, values],
  );

  useEffect(() => {
    if (!confirmOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setConfirmOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmOpen, submitting]);

  function updateMethod(key: MethodKey, enabled: boolean) {
    setValues((current) => normalizeMethodValues({
      ...current,
      [key]: enabled,
    }));
  }

  return (
    <>
      <section className="panel wide-panel payment-method-availability">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><CreditCard aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Central payment switch</p>
              <h2>Metode pembayaran aktif</h2>
            </div>
          </div>
          <span className="status-pill status-good">
            {METHOD_DEFINITIONS.filter((method) =>
              values[method.key] && readinessFor(method.key, readiness) &&
              (method.key !== "mixedWalletQrisEnabled" || (values.qrisDanaEnabled && readiness.qrisMerchantReady && values.walletCheckoutEnabled)) &&
              (method.key !== "walletTopupEnabled" ||
                (values.walletCheckoutEnabled &&
                  ((values.qrisDanaEnabled && readiness.qrisMerchantReady) ||
                    (values.jagoTransferEnabled && readiness.jagoTransferReady)))),
            ).length} aktif
          </span>
        </div>

        <p className="payment-method-intro">
          Metode nonaktif langsung hilang dari pilihan Telegram dan ditolak oleh backend untuk checkout baru. Invoice yang sudah dibuat tetap dapat dibayar sampai batas waktunya.
        </p>

        <div className="payment-method-grid">
          {METHOD_DEFINITIONS.map((method) => {
            const Icon = method.icon;
            const ready = readinessFor(method.key, readiness);
            const mixedDependencyMissing = method.key === "mixedWalletQrisEnabled" &&
              (!values.qrisDanaEnabled || !readiness.qrisMerchantReady || !values.walletCheckoutEnabled);
            const topupDependencyMissing = method.key === "walletTopupEnabled" &&
              (!values.walletCheckoutEnabled ||
                (!(values.qrisDanaEnabled && readiness.qrisMerchantReady) &&
                  (!values.jagoTransferEnabled || !readiness.jagoTransferReady)));
            const dependencyMissing = mixedDependencyMissing || topupDependencyMissing;
            const disabled = submitting ||
              (dependencyMissing && !values[method.key]) ||
              (!ready && !values[method.key]);
            const effectiveEnabled = values[method.key] && ready &&
              !mixedDependencyMissing && !topupDependencyMissing;
            return (
              <label className={`payment-method-card ${effectiveEnabled ? "is-enabled" : "is-disabled"}`} key={method.key}>
                <input
                  checked={values[method.key]}
                  disabled={disabled}
                  type="checkbox"
                  onChange={(event) => updateMethod(method.key, event.target.checked)}
                />
                <span className="payment-method-card-icon"><Icon aria-hidden="true" size={20} /></span>
                <span className="payment-method-card-copy">
                  <strong>{method.label}</strong>
                  <small>{method.description}</small>
                  {!ready ? <em>Konfigurasi provider belum lengkap.</em> : null}
                  {mixedDependencyMissing ? <em>Aktifkan wallet dan QRIS terlebih dahulu.</em> : null}
                  {topupDependencyMissing ? <em>Aktifkan wallet checkout dan QRIS/DANA atau Bank Jago.</em> : null}
                </span>
                <span className={`status-pill ${effectiveEnabled ? "status-good" : "status-neutral"}`}>
                  {effectiveEnabled ? "Aktif" : values[method.key] ? "Perlu config" : "Nonaktif"}
                </span>
              </label>
            );
          })}
        </div>

          {!readiness.qrisMerchantReady || !readiness.jagoTransferReady || !readiness.binanceInternalReady || !readiness.usdtBep20Ready ? (
            <p className="alert alert-error payment-method-warning">
            <TriangleAlert aria-hidden="true" size={18} /> Lengkapi rekening, Binance ID/verifier, atau alamat wallet pada panel provider sebelum mengaktifkan metode terkait.
          </p>
        ) : (
          <p className="alert alert-success payment-method-warning">
            <ShieldCheck aria-hidden="true" size={18} /> Seluruh provider eksternal siap diaktifkan tanpa jalur konfirmasi manual.
          </p>
        )}

        <div className="payment-method-footer">
          <p className="fine-print">
            {updatedAt ? `Terakhir diubah ${updatedAt}${updatedBy ? ` oleh ${updatedBy}` : ""}.` : "Belum pernah diubah melalui panel pusat."}
          </p>
          <button
            className="button button-primary"
            disabled={changedMethods.length === 0 || submitting}
            type="button"
            onClick={() => setConfirmOpen(true)}
          >
            <Save aria-hidden="true" size={17} /> Tinjau {changedMethods.length || ""} perubahan
          </button>
        </div>
      </section>

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi metode</p><h2 id={titleId}>Terapkan perubahan payment?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              {changedMethods.map((method) => `${method.label}: ${values[method.key] ? "aktif" : "nonaktif"}`).join("; ")}.
              Perubahan hanya memblokir checkout baru dan tidak membatalkan invoice lama.
            </p>
            <form action="/api/admin/payment-settings/method-availability" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="returnTo" type="hidden" value={returnTo} />
              {METHOD_DEFINITIONS.map((method) => (
                <input key={method.key} name={method.key} type="hidden" value={values[method.key] ? "true" : "false"} />
              ))}
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, terapkan"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? <AdminProcessingOverlay title="Metode pembayaran sedang diperbarui" description="Sistem sedang memvalidasi kesiapan provider dan menerapkan guard checkout baru." /> : null}
    </>
  );
}
