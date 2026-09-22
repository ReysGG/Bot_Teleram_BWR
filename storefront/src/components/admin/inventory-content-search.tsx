"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { searchInventoryContent } from "@/server/admin/inventory-content-search";

type Result = Awaited<ReturnType<typeof searchInventoryContent>>;
export function InventoryContentSearch({ products }: { products: Array<{ id: string; name: string }> }) {
  const [query, setQuery] = useState("");
  const [productId, setProductId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const criteria = useRef({ query: "", productId: "" });
  useEffect(() => () => controller.current?.abort(), []);

  async function run(continueSearch = false) {
    if (controller.current) return;
    const control = new AbortController();
    controller.current = control;
    setPending(true); setError("");
    if (!continueSearch) { criteria.current = { query: query.trim(), productId }; setResult(null); }
    let current: Result = continueSearch && result ? result : { matches: [], scanned: 0, unreadable: 0, nonText: 0, next: null };
    try {
      // Sequential bounded batches; stop after 5,000 examined items or 100 new
      // matches so a broad query cannot run indefinitely in the background.
      let newMatches = 0;
      for (let page = 0; page < 50; page++) {
        const response = await fetch("/api/admin/inventory/search", {
          method: "POST", cache: "no-store", signal: control.signal,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...criteria.current, after: current.next ?? undefined }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Pencarian gagal.");
        const batch = data as Result;
        newMatches += batch.matches.length;
        current = { matches: [...current.matches, ...batch.matches], scanned: current.scanned + batch.scanned,
          unreadable: current.unreadable + batch.unreadable, nonText: current.nonText + batch.nonText, next: batch.next };
        setResult(current);
        if (!current.next || newMatches >= 100) break;
        await new Promise(resolve => setTimeout(resolve, 600));
        if (control.signal.aborted) break;
      }
    } catch (cause) {
      if (!control.signal.aborted) setError(cause instanceof Error ? cause.message : "Pencarian gagal.");
    } finally { controller.current = null; setPending(false); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void run(); }
  return <section className="panel inventory-panel">
    <form onSubmit={submit} className="inventory-filter-form" autoComplete="off">
      <label className="inventory-filter-search"><span>Isi stok / kode CDK</span>
        <input type="password" value={query} onChange={event => setQuery(event.target.value)} minLength={4} maxLength={256} required disabled={pending} placeholder="Tempel kode CDK atau potongan isi file" autoComplete="off" spellCheck={false} />
      </label>
      <label><span>Produk</span><select value={productId} onChange={event => setProductId(event.target.value)} disabled={pending}><option value="">Semua produk</option>{products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <div className="inventory-filter-actions"><button className="button" type="submit" disabled={pending}>{pending ? "Mencari…" : "Cari isi stok"}</button>
        {pending ? <button className="button button-ghost" type="button" onClick={() => controller.current?.abort()}>Hentikan</button> : null}
      </div>
    </form>
    <p className="muted">Minimal 4 karakter. Mencocokkan potongan teks tanpa membedakan huruf besar/kecil. Kode pencarian tidak dimasukkan ke URL. File biner tidak dicari.</p>
    {error ? <p role="alert" className="alert alert-error">{error}</p> : null}
    {result ? <>
      <p role="status">{pending ? "Sedang mencari" : result.next ? "Hasil sementara" : "Pencarian selesai"}: {result.matches.length} stok cocok dari {result.scanned} stok diperiksa.</p>
      {result.unreadable > 0 ? <p className="alert alert-error">{result.unreadable} file gagal didekripsi; hasil belum mencakup file tersebut. Periksa kunci enkripsi atau kondisi file.</p> : null}
      {result.nonText > 0 ? <p className="muted">{result.nonText} file nonteks dilewati.</p> : null}
      <div className="table-wrap"><table data-sort-mode="server"><thead><tr><th>Stok / produk</th><th>Status</th><th>Pembeli</th><th>Invoice</th><th>Aksi</th></tr></thead><tbody>
        {result.matches.map(item => <tr key={item.id}>
          <td>{item.filename}<br /><small>{item.product}</small></td>
          <td>{item.status}{item.archived ? " · Arsip" : ""}{item.deliveredAt ? <><br /><small>{new Date(item.deliveredAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB</small></> : null}</td>
          <td>{item.order ? <>{item.order.buyerDisplayName || "Pembeli"}{item.order.buyerUsername ? <><br />@{item.order.buyerUsername}</> : null}{item.order.buyerEmail ? <><br />{item.order.buyerEmail}</> : null}<br /><small>ID: {item.order.chatId}</small></> : "Belum terkait pembeli"}</td>
          <td>{item.order ? <><Link href={`/admin/orders/${encodeURIComponent(item.order.id)}`} prefetch={false}>{item.order.invoiceNumber}</Link><br /><small>{item.order.status}</small></> : "—"}</td>
          <td><Link href={`/admin/inventory/${encodeURIComponent(item.id)}`} prefetch={false}>Detail stok</Link></td>
        </tr>)}
      </tbody></table></div>
      {!pending && !result.matches.length && !result.next ? <p>Tidak ditemukan kecocokan pada file yang berhasil diperiksa.</p> : null}
      {!pending && result.next ? <button className="button" type="button" onClick={() => void run(true)}>Lanjutkan pencarian berikutnya</button> : null}
    </> : <p>Tempel kode lalu tekan Cari. Hasil akan menampilkan pembeli dan invoice tanpa membuka transaksi satu per satu.</p>}
  </section>;
}
