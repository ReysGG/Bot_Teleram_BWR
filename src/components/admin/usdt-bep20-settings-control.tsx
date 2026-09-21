"use client";

import { useEffect, useId, useState } from "react";
import { Blocks, Save, Server, ShieldCheck, TriangleAlert, WalletCards, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export function UsdtBep20SettingsControl({
  enabled,
  recipientAddress,
  minimumConfirmations,
  tokenContract,
  rpcMode,
  updatedAt,
  updatedBy,
}: {
  enabled: boolean;
  recipientAddress: string;
  minimumConfirmations: number;
  tokenContract: string;
  rpcMode: "environment" | "default" | "unavailable";
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [nextAddress, setNextAddress] = useState(recipientAddress);
  const [nextConfirmations, setNextConfirmations] = useState(String(minimumConfirmations));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const normalizedAddress = nextAddress.trim();
  const parsedConfirmations = Number(nextConfirmations);
  const addressValid = EVM_ADDRESS_PATTERN.test(normalizedAddress);
  const confirmationsValid = Number.isSafeInteger(parsedConfirmations)
    && parsedConfirmations >= 1
    && parsedConfirmations <= 100;
  const changed = normalizedAddress.toLowerCase() !== recipientAddress.toLowerCase()
    || parsedConfirmations !== minimumConfirmations;
  const canSave = changed
    && confirmationsValid
    && (!enabled || (addressValid && rpcMode !== "unavailable"))
    && !submitting;

  useEffect(() => {
    if (!confirmOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setConfirmOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmOpen, submitting]);

  const rpcLabel = rpcMode === "environment"
    ? "RPC dari environment aktif"
    : rpcMode === "default"
      ? "RPC BSC resmi default aktif"
      : "RPC belum tersedia";

  return (
    <>
      <section className="panel wide-panel usdt-bep20-settings">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><WalletCards aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">On-chain payment verifier</p>
              <h2>USDT BEP20</h2>
            </div>
          </div>
          <span className={`status-pill ${enabled ? "status-good" : "status-neutral"}`}>
            {enabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>

        <div className="usdt-bep20-network-strip">
          <span><Blocks aria-hidden="true" size={17} /><strong>BNB Smart Chain Mainnet</strong> Chain ID 56</span>
          <span><ShieldCheck aria-hidden="true" size={17} /><strong>Token terverifikasi</strong> USDT, 18 decimals</span>
          <span className={rpcMode === "unavailable" ? "is-error" : ""}><Server aria-hidden="true" size={17} /><strong>Node</strong> {rpcLabel}</span>
        </div>

        <div className="usdt-bep20-settings-grid">
          <label>
            Alamat penerima
            <input
              autoComplete="off"
              maxLength={42}
              placeholder="0x..."
              spellCheck={false}
              value={nextAddress}
              onChange={(event) => setNextAddress(event.target.value.replace(/\s/g, ""))}
            />
            <small>Alamat wallet BSC milik toko. Periksa ulang seluruh 42 karakter sebelum mengaktifkan.</small>
          </label>
          <label>
            Minimum konfirmasi blok
            <input
              inputMode="numeric"
              max={100}
              min={1}
              step={1}
              type="number"
              value={nextConfirmations}
              onChange={(event) => setNextConfirmations(event.target.value)}
            />
            <small>Produk baru dikirim setelah transaksi mencapai jumlah konfirmasi ini.</small>
          </label>
          <label className="usdt-bep20-contract">
            Kontrak token tetap
            <code>{tokenContract}</code>
            <small>Binance-Peg BSC-USD pada BNB Smart Chain. Kontrak tidak dapat diubah dari dashboard.</small>
          </label>
          <label className="checkbox-row usdt-bep20-enable">
            <input checked={enabled} disabled readOnly type="checkbox" />
            <span>
              <strong>Status dikelola panel pusat</strong>
              <small>Aktifkan atau nonaktifkan USDT BEP20 melalui panel Metode pembayaran aktif di atas.</small>
            </span>
          </label>
        </div>

        {enabled && !addressValid ? (
          <p className="alert alert-error usdt-bep20-warning"><TriangleAlert aria-hidden="true" size={18} /> Alamat penerima harus berupa alamat EVM 42 karakter yang valid.</p>
        ) : rpcMode === "unavailable" ? (
          <p className="alert alert-error usdt-bep20-warning"><TriangleAlert aria-hidden="true" size={18} /> Verifier tidak dapat diaktifkan sebelum koneksi RPC tersedia.</p>
        ) : (
          <p className="alert alert-success usdt-bep20-warning"><ShieldCheck aria-hidden="true" size={18} /> Tidak ada tombol konfirmasi manual. Pembayaran hanya dapat melunasi order setelah lolos verifikasi blockchain.</p>
        )}

        <p className="fine-print">
          URL RPC tetap menjadi secret server dan tidak pernah ditampilkan di dashboard.
          {updatedAt ? ` Terakhir diubah ${updatedAt}${updatedBy ? ` oleh ${updatedBy}` : ""}.` : " Belum pernah diubah."}
        </p>
        <div className="admin-modal-actions">
          <button className="button button-primary" disabled={!canSave} type="button" onClick={() => setConfirmOpen(true)}>
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
              <div><p className="eyebrow">Konfirmasi USDT BEP20</p><h2 id={titleId}>Simpan konfigurasi on-chain?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              Konfigurasi akan disimpan dengan minimum <strong>{parsedConfirmations} konfirmasi</strong>. Status metode tetap <strong>{enabled ? "aktif" : "nonaktif"}</strong> dan hanya dapat diubah melalui panel pusat.
              {normalizedAddress ? <> Alamat tujuan: <strong className="usdt-bep20-address">{normalizedAddress}</strong>.</> : null}
            </p>
            <form action="/api/admin/payment-settings/usdt-bep20" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="recipientAddress" type="hidden" value={normalizedAddress} />
              <input name="minimumConfirmations" type="hidden" value={parsedConfirmations} />
              <button className="button button-primary" disabled={submitting} type="submit"><Save aria-hidden="true" size={17} /> {submitting ? "Menyimpan..." : "Ya, simpan"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? <AdminProcessingOverlay title="Konfigurasi USDT BEP20 sedang disimpan" description="Sistem sedang memvalidasi alamat, konfirmasi blok, dan status verifier." /> : null}
    </>
  );
}
