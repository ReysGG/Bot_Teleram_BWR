"use client";

import { useEffect, useId, useState } from "react";
import { BellRing, Save, ShieldCheck, TriangleAlert, WalletCards, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

const ACCOUNT_PATTERN = /^\d{8,20}$/;

export function JagoTransferSettingsControl({
  enabled,
  accountNumber,
  updatedAt,
  updatedBy,
}: {
  enabled: boolean;
  accountNumber: string;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [nextAccountNumber, setNextAccountNumber] = useState(accountNumber);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const normalizedAccount = nextAccountNumber.trim();
  const accountValid = ACCOUNT_PATTERN.test(normalizedAccount);
  const changed = normalizedAccount !== accountNumber;
  const canSave = changed && (!enabled || accountValid) && !submitting;

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
      <section className="panel wide-panel usdt-bep20-settings jago-transfer-settings">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><WalletCards aria-hidden="true" /></span>
            <div><p className="eyebrow">Android notification payment</p><h2>Transfer Bank Jago</h2></div>
          </div>
          <span className={`status-pill ${enabled ? "status-good" : "status-neutral"}`}>{enabled ? "Aktif" : "Nonaktif"}</span>
        </div>

        <div className="usdt-bep20-network-strip">
          <span><BellRing aria-hidden="true" size={17} /><strong>Sumber</strong> Notifikasi transfer masuk Bank Jago</span>
          <span><ShieldCheck aria-hidden="true" size={17} /><strong>Pencocokan</strong> Nominal unik + waktu invoice</span>
          <span><ShieldCheck aria-hidden="true" size={17} /><strong>Isolasi</strong> Tidak dapat cocok ke DANA/Binance</span>
        </div>

        <div className="usdt-bep20-settings-grid">
          <label>
            Nomor rekening Bank Jago
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={32}
              placeholder="Nomor rekening penerima"
              spellCheck={false}
              value={nextAccountNumber}
              onChange={(event) => setNextAccountNumber(event.target.value.replace(/\D/g, ""))}
            />
            <small>Nomor ini ditampilkan hanya pada invoice pembayaran Bank Jago.</small>
          </label>
          <label className="checkbox-row usdt-bep20-enable">
            <input checked={enabled} disabled readOnly type="checkbox" />
            <span><strong>Status dikelola panel pusat</strong><small>Aktifkan atau nonaktifkan Bank Jago melalui panel Metode pembayaran aktif di atas.</small></span>
          </label>
        </div>

        {enabled && !accountValid ? (
          <p className="alert alert-error usdt-bep20-warning"><TriangleAlert aria-hidden="true" size={18} /> Nomor rekening harus berisi 8-20 digit.</p>
        ) : (
          <p className="alert alert-success usdt-bep20-warning"><ShieldCheck aria-hidden="true" size={18} /> Pembayaran hanya dikonfirmasi dari notifikasi package Bank Jago resmi dengan nominal dan waktu yang cocok.</p>
        )}

        <p className="fine-print">
          Nomor rekening tidak ditanam di APK. Android bridge hanya membawa event notifikasi yang ditandatangani.
          {updatedAt ? ` Terakhir diubah ${updatedAt}${updatedBy ? ` oleh ${updatedBy}` : ""}.` : " Belum pernah diubah."}
        </p>
        <div className="admin-modal-actions">
          <button className="button button-primary" disabled={!canSave} type="button" onClick={() => setConfirmOpen(true)}><Save aria-hidden="true" size={17} /> Tinjau perubahan</button>
        </div>
      </section>

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi Bank Jago</p><h2 id={titleId}>Simpan konfigurasi rekening?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>Rekening tujuan akan disimpan sebagai <strong>{normalizedAccount || "-"}</strong>. Status metode tetap <strong>{enabled ? "aktif" : "nonaktif"}</strong> dan hanya dapat diubah melalui panel pusat.</p>
            <form action="/api/admin/payment-settings/jago-transfer" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="accountNumber" type="hidden" value={normalizedAccount} />
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, simpan"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? <AdminProcessingOverlay title="Konfigurasi Bank Jago sedang disimpan" description="Sistem sedang memvalidasi nomor rekening dan status metode pembayaran." /> : null}
    </>
  );
}
