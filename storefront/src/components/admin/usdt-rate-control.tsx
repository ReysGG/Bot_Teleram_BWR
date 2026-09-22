"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { CircleDollarSign, Save, TriangleAlert, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import {
  formatIdrAsUsdt,
  MAX_USDT_IDR_RATE,
  MIN_USDT_IDR_RATE,
} from "@/server/payment/usdt-amount";

const PREVIEW_IDR_AMOUNT = 37_000;

export function UsdtRateControl({
  rate,
  updatedAt,
  updatedBy,
}: {
  rate: number;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [value, setValue] = useState(String(rate));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const parsedRate = Number(value);
  const valid = Number.isSafeInteger(parsedRate)
    && parsedRate >= MIN_USDT_IDR_RATE
    && parsedRate <= MAX_USDT_IDR_RATE;
  const changed = valid && parsedRate !== rate;
  const preview = useMemo(
    () => valid ? formatIdrAsUsdt(PREVIEW_IDR_AMOUNT, parsedRate) : null,
    [parsedRate, valid],
  );

  useEffect(() => {
    if (!confirmOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setConfirmOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmOpen, submitting]);

  return (
    <>
      <section className="panel wide-panel usdt-rate-control">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><CircleDollarSign aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Crypto pricing reference</p>
              <h2>Kurs tetap USDT</h2>
            </div>
          </div>
          <span className="status-pill status-good">Referensi invoice BEP20</span>
        </div>

        <div className="usdt-rate-layout">
          <label>
            Rupiah untuk 1 USDT
            <input
              inputMode="numeric"
              max={MAX_USDT_IDR_RATE}
              min={MIN_USDT_IDR_RATE}
              name="ratePreview"
              required
              step="1"
              type="number"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <div className="usdt-rate-preview" aria-live="polite">
            <span>Contoh tagihan</span>
            <strong>
              Rp{PREVIEW_IDR_AMOUNT.toLocaleString("id-ID")} = {preview ?? "Kurs tidak valid"}
            </strong>
            <small>Nominal USDT selalu dibulatkan naik hingga 6 desimal agar toko tidak kurang menerima.</small>
          </div>
        </div>

        <p className="alert alert-error usdt-rate-warning">
          <TriangleAlert aria-hidden="true" size={18} />
          Semakin tinggi angka kurs IDR per USDT, semakin sedikit USDT yang ditagihkan. Periksa contoh sebelum menyimpan agar tidak salah harga.
        </p>
        <p className="fine-print">
          Kurs ini dipakai ketika invoice USDT BEP20 baru dibuat dan tidak mengubah invoice yang sudah ada.
          {updatedAt ? ` Terakhir diubah ${updatedAt}${updatedBy ? ` oleh ${updatedBy}` : ""}.` : " Belum pernah diubah dari nilai default."}
        </p>
        <div className="admin-modal-actions">
          <button
            className="button button-primary"
            disabled={!changed || submitting}
            type="button"
            onClick={() => setConfirmOpen(true)}
          >
            <Save aria-hidden="true" size={17} /> Tinjau perubahan
          </button>
        </div>
      </section>

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi kurs</p><h2 id={titleId}>Simpan kurs baru?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              Kurs berubah dari <strong>Rp{rate.toLocaleString("id-ID")}</strong> menjadi <strong>Rp{parsedRate.toLocaleString("id-ID")}</strong> per 1 USDT.
              Contoh Rp{PREVIEW_IDR_AMOUNT.toLocaleString("id-ID")} akan ditagihkan sebagai <strong>{preview}</strong>.
            </p>
            <form action="/api/admin/payment-settings/usdt-rate" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="rate" type="hidden" value={parsedRate} />
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, simpan kurs"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? (
        <AdminProcessingOverlay
          title="Kurs USDT sedang diperbarui"
          description="Sistem sedang memvalidasi nilai dan mencatat identitas admin yang melakukan perubahan."
        />
      ) : null}
    </>
  );
}
