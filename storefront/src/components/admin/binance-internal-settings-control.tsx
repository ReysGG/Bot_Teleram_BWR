"use client";

import { useEffect, useId, useState } from "react";
import { BadgeCheck, KeyRound, Save, ShieldCheck, TriangleAlert, WalletCards, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

const BINANCE_ID_PATTERN = /^\d{5,32}$/;

export function BinanceInternalSettingsControl({
  enabled,
  recipientId,
  apiConfigured,
  webSessionReady,
  webSessionConfigured,
  webCheckoutEnabled,
  webAutoConfirmEnabled,
  verifierMode,
  updatedAt,
  updatedBy,
}: {
  enabled: boolean;
  recipientId: string;
  apiConfigured: boolean;
  webSessionReady: boolean;
  webSessionConfigured: boolean;
  webCheckoutEnabled: boolean;
  webAutoConfirmEnabled: boolean;
  verifierMode: "WEB_SESSION" | "OFFICIAL_API" | "NONE";
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [nextRecipientId, setNextRecipientId] = useState(recipientId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const normalizedRecipientId = nextRecipientId.trim();
  const recipientValid = BINANCE_ID_PATTERN.test(normalizedRecipientId);
  const changed = normalizedRecipientId !== recipientId;
  const verifierReady = apiConfigured || webSessionReady;
  const canSave = changed && (!enabled || (recipientValid && apiConfigured)) && !submitting;

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
      <section className="panel wide-panel usdt-bep20-settings binance-internal-settings">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><WalletCards aria-hidden="true" /></span>
            <div><p className="eyebrow">Internal payment verifier</p><h2>Binance Pay (Binance-to-Binance)</h2></div>
          </div>
          <span className={`status-pill ${enabled ? "status-good" : "status-neutral"}`}>{enabled ? "Aktif" : "Nonaktif"}</span>
        </div>

        <div className="usdt-bep20-network-strip">
          <span><BadgeCheck aria-hidden="true" size={17} /><strong>Bukti wajib</strong> Order ID Binance Pay</span>
          <span><ShieldCheck aria-hidden="true" size={17} /><strong>Validasi</strong> Income USDT, penerima, nominal, waktu</span>
          <span className={verifierReady ? "" : "is-error"}><KeyRound aria-hidden="true" size={17} /><strong>Verifier</strong> {verifierMode === "WEB_SESSION" ? "Web session" : verifierMode === "OFFICIAL_API" ? "API read-only" : "Belum tersedia"}</span>
          <span className={webSessionConfigured ? "" : "is-error"}><ShieldCheck aria-hidden="true" size={17} /><strong>Session web</strong> {webSessionConfigured ? "Tervalidasi" : "Belum tersedia"}</span>
        </div>

        <div className="usdt-bep20-settings-grid">
          <label>
            Binance ID penerima
            <input
              autoComplete="off"
              inputMode="numeric"
              maxLength={32}
              placeholder="Contoh: 567896636"
              spellCheck={false}
              value={nextRecipientId}
              onChange={(event) => setNextRecipientId(event.target.value.replace(/\D/g, ""))}
            />
            <small>Binance ID akun toko yang menerima transfer USDT internal.</small>
          </label>
          <label className="checkbox-row usdt-bep20-enable">
            <input checked={enabled} disabled readOnly type="checkbox" />
            <span><strong>Status dikelola panel pusat</strong><small>Aktifkan atau nonaktifkan Binance Pay melalui panel Metode pembayaran aktif di atas.</small></span>
          </label>
        </div>

        {enabled && !recipientValid ? (
          <p className="alert alert-error usdt-bep20-warning"><TriangleAlert aria-hidden="true" size={18} /> Binance ID penerima harus berisi 5-32 digit.</p>
        ) : webSessionConfigured && !webCheckoutEnabled ? (
          <p className="alert alert-warning usdt-bep20-warning"><ShieldCheck aria-hidden="true" size={18} /> Session web sudah tervalidasi, tetapi gate checkout masih ditutup untuk tahap read-only. Auto-confirm {webAutoConfirmEnabled ? "aktif" : "nonaktif"}.</p>
        ) : !verifierReady ? (
          <p className="alert alert-error usdt-bep20-warning"><TriangleAlert aria-hidden="true" size={18} /> Tambahkan API read-only atau web session Binance yang tervalidasi sebelum mengaktifkan metode ini.</p>
        ) : (
          <p className="alert alert-success usdt-bep20-warning"><ShieldCheck aria-hidden="true" size={18} /> Admin tidak dapat melewati verifier. Produk hanya dikirim setelah transaksi masuk cocok.</p>
        )}

        <p className="fine-print">
          Web session disimpan terenkripsi. Jika memakai API, key dan secret tetap hanya berada di environment server dengan izin baca tanpa trading/withdrawal.
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
              <div><p className="eyebrow">Konfirmasi Binance Pay</p><h2 id={titleId}>Simpan konfigurasi pembayaran?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>Binance ID akan disimpan sebagai <strong>{normalizedRecipientId || "-"}</strong>. Status metode tetap <strong>{enabled ? "aktif" : "nonaktif"}</strong> dan hanya dapat diubah melalui panel pusat.</p>
            <form action="/api/admin/payment-settings/binance-internal" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="recipientId" type="hidden" value={normalizedRecipientId} />
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, simpan"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? <AdminProcessingOverlay title="Konfigurasi Binance Pay sedang disimpan" description="Sistem sedang memvalidasi Binance ID penerima dan kesiapan verifier read-only." /> : null}
    </>
  );
}
