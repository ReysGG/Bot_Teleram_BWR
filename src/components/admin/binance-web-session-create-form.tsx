"use client";

import { useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function BinanceWebSessionCreateForm({
  recipientBinanceId,
}: {
  recipientBinanceId: string | null;
}) {
  const [submitting, setSubmitting] = useState(false);
  const ready = Boolean(recipientBinanceId);
  return (
    <>
      <form
        action="/api/admin/payment-settings/binance-web"
        className="form-grid"
        method="post"
        onSubmit={() => setSubmitting(true)}
      >
        <label>
          Nama session
          <input
            autoComplete="off"
            maxLength={100}
            minLength={2}
            name="name"
            placeholder="Contoh: Binance merchant utama"
            required
          />
        </label>
        <label>
          Binance ID yang akan diikat
          <input disabled readOnly value={recipientBinanceId ?? "Belum dikonfigurasi"} />
          <small>
            Nilai dibaca ulang dari konfigurasi Binance Pay di server dan tidak
            dipercaya dari input tersembunyi browser.
          </small>
        </label>
        <label>
          Cookie JSON Binance
          <textarea
            autoComplete="off"
            maxLength={768000}
            name="cookieJson"
            placeholder={'[ { "domain": ".binance.com", "name": "...", "value": "..." } ]'}
            required
            rows={9}
            spellCheck={false}
          />
          <small>
            Export cookie dari akun Binance penerima yang Anda kontrol. Cookie
            dienkripsi dan tidak pernah ditampilkan kembali.
          </small>
        </label>
        <button
          className="button button-primary"
          disabled={!ready || submitting}
          type="submit"
        >
          {submitting ? (
            <><KeyRound aria-hidden="true" size={17} /> Mengenkripsi...</>
          ) : (
            <><Save aria-hidden="true" size={17} /> Simpan untuk validasi</>
          )}
        </button>
      </form>
      {submitting ? (
        <AdminProcessingOverlay
          description="Cookie sedang divalidasi dan dienkripsi. Nilai mentah tidak akan ditampilkan kembali."
          title="Menyimpan session Binance"
        />
      ) : null}
    </>
  );
}
