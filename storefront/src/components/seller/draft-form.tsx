"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type DraftValue = { id: string; name: string; description: string; price: number; revision: number };

export function SellerDraftForm({ draft }: { draft?: DraftValue }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef("");
  const router = useRouter();
  const editing = Boolean(draft);

  return <form onChange={() => { key.current = ""; }} onSubmit={async event => {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    key.current ||= crypto.randomUUID();
    setBusy(true); setError("");
    try {
      const response = await fetch(editing ? `/api/seller/drafts/${encodeURIComponent(draft!.id)}` : "/api/seller/drafts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), description: form.get("description"), price: Number(form.get("price")), revision: draft?.revision, requestKey: key.current }),
      });
      if (!response.ok) throw new Error("draft_not_saved");
      router.push(`/seller/products?notice=${editing ? "updated" : "created"}`); router.refresh();
    } catch { setError("Draft belum tersimpan. Periksa akses seller dan isian produk, lalu coba lagi."); }
    finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} style={{ border: 0, display: "grid", gap: 16 }}>
      <label>Nama produk<input name="name" defaultValue={draft?.name} minLength={2} maxLength={100} required /></label>
      <label>Deskripsi<textarea name="description" defaultValue={draft?.description} minLength={5} maxLength={10000} required rows={6} /></label>
      <label>Harga (Rp)<input name="price" defaultValue={draft?.price} type="number" min={1} max={1000000000} step={1} required /></label>
      {error ? <p role="alert">{error}</p> : null}
      <button className="seller-button" disabled={busy}>{busy ? "Menyimpan..." : editing ? "Simpan revisi" : "Simpan draft"}</button>
    </fieldset>
  </form>;
}
