"use client";
import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { loadSearchIndex } from "@/lib/search-index-client";
import { recommendProducts, type ProductSearchEntry } from "@/lib/product-search";
import { formatRupiah } from "@/lib/catalog-types";

export function ProductSearchInput({ label, defaultValue = "", placeholder = "Cari produk, kategori, atau kebutuhan..." }: { label: string; defaultValue?: string; placeholder?: string }) {
  const id = useId();
  const router = useRouter();
  const [query, setQuery] = useState(defaultValue);
  const [entries, setEntries] = useState<ProductSearchEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);
  const results = useMemo(() => recommendProducts(entries, query), [entries, query]);
  async function focus() {
    setOpen(true); setActive(-1); setLoading(true); setFailed(false);
    try { setEntries(await loadSearchIndex()); } catch { setFailed(true); }
    finally { setLoading(false); }
  }
  function choose(entry: ProductSearchEntry) { setOpen(false); router.push(`/products/${encodeURIComponent(entry.slug)}`); }
  return <div className="product-search-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <input role="combobox" aria-label={label} name="q" autoComplete="off" maxLength={100} value={query} placeholder={placeholder}
      aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-activedescendant={open && active >= 0 && results[active] ? `${id}-${active}` : undefined}
      onFocus={() => void focus()} onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); setActive(-1); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault(); setOpen(true);
          setActive(value => !results.length ? -1 : value < 0 ? event.key === "ArrowDown" ? 0 : results.length - 1 : (value + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
        }
        if (event.key === "Enter" && open && active >= 0 && results[active]) { event.preventDefault(); choose(results[active]); }
      }} />
    {open ? <div className="product-search-popover">
      <span className="search-suggestion-heading">{query.trim() ? "Produk yang cocok" : "Rekomendasi produk"}</span>
      {loading ? <p role="status">Memuat rekomendasi...</p> : failed ? <p role="status">Rekomendasi belum tersedia. Tekan Enter untuk mencari.</p> : <>
        <div role="listbox" id={`${id}-list`} aria-label="Rekomendasi produk">
          {results.map((entry, index) => <button type="button" role="option" id={`${id}-${index}`} key={entry.id} aria-selected={active === index} onPointerDown={event => event.preventDefault()} onClick={() => choose(entry)}>
            <span><strong>{entry.name}</strong><small>{entry.category || "Produk digital"}{entry.availability === "OUT_OF_STOCK" ? " · Stok habis" : ""}</small></span><b>{formatRupiah(entry.price)}</b>
          </button>)}
        </div>
        {!results.length ? <p role="status">Belum ada yang cocok. Coba nama produk atau kategori lain.</p> : null}
      </>}
      <button type="submit" className="search-all-results">{query.trim() ? "Lihat semua hasil pencarian" : "Lihat semua produk"}</button>
    </div> : null}
  </div>;
}
