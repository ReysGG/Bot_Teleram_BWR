"use client";

import { useState, type FormEvent } from "react";

const errors: Record<string, string> = {
  "stock-ineligible": "Stok sudah dipesan, terjual, atau tidak berstatus banned. Pengambilan dibatalkan.",
  "stock-missing": "Stok tidak ditemukan.",
  "stock-changed": "Status stok berubah. Muat ulang halaman sebelum mencoba kembali.",
  "email-missing": "File akun tidak memiliki email yang dapat dicocokkan. Pilih file akun saja.",
  "email-unmapped": "Data login email belum tersedia di vault. Pilih file akun saja atau impor pasangan email terlebih dahulu.",
  "email-mismatch": "Identitas email tidak cocok. Pengambilan dibatalkan.",
  unauthorized: "Sesi admin tidak valid. Silakan masuk kembali.",
};

export function StockTakeoutForm({ id }: { id: string }) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const archive = form.get("archive") === "true";
    if (archive && !window.confirm("Ambil dan arsipkan stok ini? Stok akan dikeluarkan dari penjualan. Jika unduhan terputus, unduh kembali dari halaman ini atau Arsip.")) return;
    setPending(true); setNotice("");
    try {
      const response = await fetch(`/api/admin/inventory/${id}/takeout`, { method: "POST", body: form });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(errors[result.error] ?? "File belum dapat diambil. Coba kembali.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const encoded = response.headers.get("Content-Disposition")?.match(/filename\*=UTF-8''([^;]+)/)?.[1];
      anchor.href = url; anchor.download = encoded ? decodeURIComponent(encoded) : `stock-${id}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setNotice(archive ? "Unduhan disiapkan. Stok sudah diarsipkan dan dikeluarkan dari penjualan." : "Unduhan disiapkan. Status stok tetap.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Unduhan gagal. Coba kembali."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit}>
    <fieldset disabled={pending}>
      <legend>Isi unduhan</legend>
      <label><input type="radio" name="mode" value="bundle" defaultChecked /> File akun + login email (ZIP)</label><br />
      <label><input type="radio" name="mode" value="account" /> File akun saja</label><br />
      <label><input type="radio" name="mode" value="email" /> Login email saja (TXT)</label>
      <p>Login email menggunakan format email----password----clientId----token dari vault. Jika pasangan tidak ditemukan, proses dibatalkan tanpa mengarsipkan stok.</p>
      <label><input type="checkbox" name="archive" value="true" defaultChecked /> Arsipkan stok setelah file siap</label>
      <p>Arsip mengeluarkan stok dari penjualan. Unduhan dapat diulang dari Arsip jika koneksi terputus.</p>
      <button type="submit" className="button">{pending ? "Menyiapkan unduhan…" : "Ambil stok"}</button>
    </fieldset>
    {notice ? <p role="status">{notice}</p> : null}
  </form>;
}
