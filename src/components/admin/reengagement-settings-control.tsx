"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  History,
  LoaderCircle,
  MessageCircleMore,
  Play,
  Save,
  ShieldAlert,
  UsersRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

type SettingsValues = {
  enabled: boolean;
  buyerInactiveDays: number;
  nonBuyerInactiveDays: number;
  cooldownDays: number;
  maxMessages: number;
  batchSize: number;
  buyerMessage: string;
  nonBuyerMessage: string;
};

function integerInRange(value: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export function ReengagementSettingsControl({
  settings,
  totalUsers,
  updatedAt,
  updatedBy,
}: {
  settings: SettingsValues;
  totalUsers: number;
  updatedAt: string | null;
  updatedBy: string | null;
}) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [buyerInactiveDays, setBuyerInactiveDays] = useState(String(settings.buyerInactiveDays));
  const [nonBuyerInactiveDays, setNonBuyerInactiveDays] = useState(String(settings.nonBuyerInactiveDays));
  const [cooldownDays, setCooldownDays] = useState(String(settings.cooldownDays));
  const [maxMessages, setMaxMessages] = useState(String(settings.maxMessages));
  const [batchSize, setBatchSize] = useState(String(settings.batchSize));
  const [buyerMessage, setBuyerMessage] = useState(settings.buyerMessage);
  const [nonBuyerMessage, setNonBuyerMessage] = useState(settings.nonBuyerMessage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [audienceAcknowledged, setAudienceAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState<"settings" | "run" | null>(null);
  const titleId = useId();
  const runTitleId = useId();

  const parsed = useMemo(() => ({
    buyerInactiveDays: integerInRange(buyerInactiveDays, 3, 365),
    nonBuyerInactiveDays: integerInRange(nonBuyerInactiveDays, 1, 365),
    cooldownDays: integerInRange(cooldownDays, 3, 365),
    maxMessages: integerInRange(maxMessages, 1, 12),
    batchSize: integerInRange(batchSize, 1, 250),
  }), [batchSize, buyerInactiveDays, cooldownDays, maxMessages, nonBuyerInactiveDays]);
  const messagesValid = buyerMessage.trim().length >= 3
    && buyerMessage.trim().length <= 2_000
    && nonBuyerMessage.trim().length >= 3
    && nonBuyerMessage.trim().length <= 2_000;
  const valuesValid = Object.values(parsed).every((value) => value !== null) && messagesValid;
  const changed = enabled !== settings.enabled
    || parsed.buyerInactiveDays !== settings.buyerInactiveDays
    || parsed.nonBuyerInactiveDays !== settings.nonBuyerInactiveDays
    || parsed.cooldownDays !== settings.cooldownDays
    || parsed.maxMessages !== settings.maxMessages
    || parsed.batchSize !== settings.batchSize
    || buyerMessage.trim() !== settings.buyerMessage
    || nonBuyerMessage.trim() !== settings.nonBuyerMessage;

  useEffect(() => {
    if (!confirmOpen && !runOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || submitting) return;
      setConfirmOpen(false);
      setRunOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [confirmOpen, runOpen, submitting]);

  function openSettingsConfirmation() {
    setAudienceAcknowledged(false);
    setConfirmOpen(true);
  }

  return (
    <>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><MessageCircleMore aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Automated win-back</p>
              <h2>Pengingat pelanggan tidak aktif</h2>
            </div>
          </div>
          <span className={`status-pill ${enabled ? "status-good" : "status-neutral"}`}>
            {enabled ? "Aktif" : "Nonaktif"}
          </span>
        </div>

        <p className="alert alert-error">
          <ShieldAlert aria-hidden="true" size={18} />
          Pengingat ini menargetkan semua pengguna bot Telegram yang masih dapat dijangkau,
          termasuk pengguna yang belum pernah membeli. Preferensi <strong>broadcastEnabled</strong>
          untuk pengumuman produk tidak digunakan oleh otomasi ini.
        </p>

        <div className="usdt-bep20-settings-grid">
          <label>
            Pembeli tidak aktif
            <input min={3} max={365} step={1} type="number" value={buyerInactiveDays} onChange={(event) => setBuyerInactiveDays(event.target.value)} />
            <small>Hari sejak interaksi atau pembelian terakhir sebelum pembeli kembali diingatkan.</small>
          </label>
          <label>
            Belum pernah membeli
            <input min={1} max={365} step={1} type="number" value={nonBuyerInactiveDays} onChange={(event) => setNonBuyerInactiveDays(event.target.value)} />
            <small>Hari sejak interaksi terakhir untuk user bot yang belum memiliki pembelian berhasil.</small>
          </label>
          <label>
            Cooldown
            <input min={3} max={365} step={1} type="number" value={cooldownDays} onChange={(event) => setCooldownDays(event.target.value)} />
            <small>Jarak minimum antar pengingat untuk penerima yang sama.</small>
          </label>
          <label>
            Maksimum per user
            <input min={1} max={12} step={1} type="number" value={maxMessages} onChange={(event) => setMaxMessages(event.target.value)} />
            <small>Batas total sequence pengingat yang dapat diantrekan untuk satu chat.</small>
          </label>
          <label>
            Batch per proses
            <input min={1} max={250} step={1} type="number" value={batchSize} onChange={(event) => setBatchSize(event.target.value)} />
            <small>Maksimum penerima yang diantrekan dalam satu eksekusi worker.</small>
          </label>
          <label className="checkbox-row">
            <input checked={enabled} disabled={Boolean(submitting)} type="checkbox" onChange={(event) => setEnabled(event.target.checked)} />
            <span>Otomasi win-back aktif</span>
          </label>
        </div>

        <div className="usdt-bep20-settings-grid wide-panel">
          <label>
            Pesan untuk pembeli lama
            <textarea maxLength={2_000} minLength={3} rows={7} value={buyerMessage} onChange={(event) => setBuyerMessage(event.target.value)} />
            <small>{buyerMessage.length}/2000 karakter</small>
          </label>
          <label>
            Pesan untuk user belum pernah membeli
            <textarea maxLength={2_000} minLength={3} rows={7} value={nonBuyerMessage} onChange={(event) => setNonBuyerMessage(event.target.value)} />
            <small>{nonBuyerMessage.length}/2000 karakter</small>
          </label>
        </div>

        <div className="usdt-bep20-settings-grid wide-panel">
          <div className="usdt-rate-preview">
            <span>Preview pembeli lama</span>
            <p className="redeem-description-preview">{buyerMessage || "Pesan belum diisi."}</p>
            <small>Tombol Telegram: Lihat katalog</small>
          </div>
          <div className="usdt-rate-preview">
            <span>Preview belum pernah membeli</span>
            <p className="redeem-description-preview">{nonBuyerMessage || "Pesan belum diisi."}</p>
            <small>Tombol Telegram: Lihat katalog</small>
          </div>
        </div>

        <p className="fine-print">
          Audience awal: {totalUsers.toLocaleString("id-ID")} chat yang masih dapat dijangkau.
          {updatedAt ? ` Terakhir diubah ${updatedAt}${updatedBy ? ` oleh ${updatedBy}` : ""}.` : " Belum pernah dikonfigurasi admin."}
        </p>
        <div className="admin-modal-actions">
          <button className="button button-primary" disabled={!changed || !valuesValid || Boolean(submitting)} type="button" onClick={openSettingsConfirmation}>
            <Save aria-hidden="true" size={17} /> Tinjau perubahan
          </button>
          <button className="button button-ghost" disabled={!settings.enabled || Boolean(submitting)} type="button" onClick={() => setRunOpen(true)}>
            <Play aria-hidden="true" size={17} /> Jalankan satu batch sekarang
          </button>
          <Link className="button button-ghost" href="/admin/broadcasts/reengagement/history" prefetch={false}>
            <History aria-hidden="true" size={17} /> Buka riwayat
          </Link>
        </div>
      </section>

      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setConfirmOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi audience</p><h2 id={titleId}>Terapkan pengaturan win-back?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={Boolean(submitting)} type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              Status menjadi <strong>{enabled ? "aktif" : "nonaktif"}</strong>. Pembeli diingatkan setelah <strong>{parsed.buyerInactiveDays} hari</strong>, user yang belum pernah membeli setelah <strong>{parsed.nonBuyerInactiveDays} hari</strong>, cooldown <strong>{parsed.cooldownDays} hari</strong>, maksimum <strong>{parsed.maxMessages} pesan</strong>, dan batch <strong>{parsed.batchSize} user</strong>.
            </p>
            <label className="checkbox-row">
              <input checked={audienceAcknowledged} disabled={Boolean(submitting)} type="checkbox" onChange={(event) => setAudienceAcknowledged(event.target.checked)} />
              <span>Saya memahami audience mencakup semua user bot yang dapat dijangkau, termasuk never-buyer, dan tidak mengikuti broadcastEnabled.</span>
            </label>
            <form action="/api/admin/broadcasts/reengagement/settings" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting("settings")}>
              <input name="enabled" type="hidden" value={enabled ? "true" : "false"} />
              <input name="buyerInactiveDays" type="hidden" value={parsed.buyerInactiveDays ?? ""} />
              <input name="nonBuyerInactiveDays" type="hidden" value={parsed.nonBuyerInactiveDays ?? ""} />
              <input name="cooldownDays" type="hidden" value={parsed.cooldownDays ?? ""} />
              <input name="maxMessages" type="hidden" value={parsed.maxMessages ?? ""} />
              <input name="batchSize" type="hidden" value={parsed.batchSize ?? ""} />
              <input name="buyerMessage" type="hidden" value={buyerMessage.trim()} />
              <input name="nonBuyerMessage" type="hidden" value={nonBuyerMessage.trim()} />
              <input name="audienceAcknowledged" type="hidden" value={audienceAcknowledged ? "true" : "false"} />
              <button className="button button-primary" disabled={!audienceAcknowledged || Boolean(submitting)} type="submit">
                {submitting === "settings" ? <><LoaderCircle aria-hidden="true" className="admin-processing-spinner" size={16} /> Menyimpan...</> : <><Save aria-hidden="true" size={17} /> Ya, terapkan</>}
              </button>
              <button className="button button-ghost" disabled={Boolean(submitting)} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {runOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setRunOpen(false);
        }}>
          <section aria-labelledby={runTitleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Manual worker run</p><h2 id={runTitleId}>Antrekan satu batch sekarang?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={Boolean(submitting)} type="button" onClick={() => setRunOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              Sistem akan memindai user sesuai konfigurasi tersimpan dan mengantrekan maksimal <strong>{settings.batchSize} penerima</strong>. Cooldown, maksimum sequence, status reachable, dan aktivitas transaksi tetap divalidasi backend.
            </p>
            <form action="/api/admin/broadcasts/reengagement/run-now" className="admin-modal-actions" method="post" onSubmit={() => setSubmitting("run")}>
              <button className="button button-primary" disabled={Boolean(submitting)} type="submit">
                {submitting === "run" ? <><LoaderCircle aria-hidden="true" className="admin-processing-spinner" size={16} /> Mengantrekan...</> : <><UsersRound aria-hidden="true" size={17} /> Ya, jalankan batch</>}
              </button>
              <button className="button button-ghost" disabled={Boolean(submitting)} type="button" onClick={() => setRunOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}

      {submitting ? (
        <AdminProcessingOverlay
          title={submitting === "settings" ? "Pengaturan win-back sedang disimpan" : "Batch win-back sedang disiapkan"}
          description={submitting === "settings"
            ? "Sistem sedang memvalidasi audience, batas pengiriman, dan template pesan."
            : "Sistem sedang memindai penerima yang memenuhi syarat dan membuat outbox idempotent."}
        />
      ) : null}
    </>
  );
}
