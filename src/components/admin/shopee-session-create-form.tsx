"use client";

import { useState } from "react";
import { KeyRound, Save } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function ShopeeSessionCreateForm() {
  const [submitting, setSubmitting] = useState(false);
  return (
    <>
      <form
        action="/api/admin/payment-settings/shopee"
        className="form-grid"
        method="post"
        onSubmit={() => setSubmitting(true)}
      >
        <label>
          Nama session
          <input autoComplete="off" maxLength={100} minLength={2} name="name" required />
        </label>
        <label>
          Token metadata API
          <input
            autoComplete="new-password"
            maxLength={16384}
            minLength={16}
            name="apiToken"
            required
            spellCheck={false}
            type="password"
          />
          <small>Token dienkripsi saat disimpan dan tidak pernah ditampilkan kembali.</small>
        </label>
        <label>
          Cookie JSON
          <textarea
            maxLength={512000}
            name="cookieJson"
            placeholder={'[ { "domain": ".shopee.co.id", "name": "...", "value": "..." } ]'}
            required
            rows={8}
            spellCheck={false}
          />
          <small>Gunakan export cookie dari akun merchant yang Anda kontrol. Jangan masukkan token ke field ini.</small>
        </label>
        <button className="button button-primary" disabled={submitting} type="submit">
          {submitting ? <><KeyRound aria-hidden="true" size={17} /> Mengenkripsi...</> : <><Save aria-hidden="true" size={17} /> Simpan untuk validasi</>}
        </button>
      </form>
      {submitting ? (
        <AdminProcessingOverlay
          description="Cookie dan token sedang divalidasi lalu dienkripsi. Kredensial tidak akan ditampilkan kembali."
          title="Menyimpan session Shopee Partner"
        />
      ) : null}
    </>
  );
}
