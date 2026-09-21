"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StorefrontProduct } from "@/lib/catalog-types";
import { ProductCard } from "./product-card";

export function LazyProductGrid({ initialProducts, orderedIds }: { initialProducts: StorefrontProduct[]; orderedIds: string[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [cursor, setCursor] = useState(initialProducts.length);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const sentinel = useRef<HTMLDivElement>(null);
  const request = useRef<AbortController | null>(null);
  const more = cursor < orderedIds.length;
  const load = useCallback(async () => {
    if (request.current || cursor >= orderedIds.length) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    const ids = orderedIds.slice(cursor, cursor + 12);
    setLoading(true); setFailed(false);
    try {
      const response = await fetch(`/api/catalog/batch?ids=${encodeURIComponent(ids.join(","))}`, { signal: controller.signal });
      if (!response.ok) throw new Error("catalog_unavailable");
      const data = await response.json() as { products: StorefrontProduct[] };
      if (controller.signal.aborted) return;
      setProducts(current => [...current, ...data.products.filter(item => !current.some(value => value.id === item.id))]);
      setCursor(cursor + ids.length);
    } catch { if (mounted.current) setFailed(true); }
    finally { window.clearTimeout(timeout); if (request.current === controller) request.current = null; if (mounted.current) setLoading(false); }
  }, [cursor, orderedIds]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    if (!more || failed || !sentinel.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void load(); }, { rootMargin: "300px" });
    observer.observe(sentinel.current); return () => observer.disconnect();
  }, [more, failed, load]);
  return <>
    <div className="product-grid">{products.map(product => <ProductCard key={product.id} product={product} />)}
      {loading ? Array.from({ length: 4 }, (_, index) => <div key={`loading-${index}`} className="product-load-skeleton" aria-hidden="true" />) : null}
    </div>
    <div className="catalog-load-more" ref={sentinel} aria-live="polite">
      <span>{products.length} produk ditampilkan</span>
      {failed ? <p>Produk berikutnya belum dapat dimuat. Silakan coba lagi.</p> : null}
      {more ? <button className="button button-quiet" disabled={loading} onClick={() => void load()}>{loading ? "Memuat produk…" : failed ? "Coba lagi" : "Tampilkan lagi"}</button> : <span>Semua produk sudah ditampilkan.</span>}
    </div>
  </>;
}
