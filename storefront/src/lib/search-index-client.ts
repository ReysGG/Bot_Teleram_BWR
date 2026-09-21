import type { ProductSearchEntry } from "./product-search";
let cache: ProductSearchEntry[] | null = null;
let expiresAt = 0;
let retryAfter = 0;
let pending: Promise<ProductSearchEntry[]> | null = null;

export async function loadSearchIndex(): Promise<ProductSearchEntry[]> {
  if (cache && Date.now() < expiresAt) return cache;
  if (pending) return pending;
  if (Date.now() < retryAfter) throw new Error("search_temporarily_unavailable");
  pending = Promise.resolve().then(async () => {
    try {
      const response = await fetch("/api/catalog/search-index", { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("search_unavailable");
      const data = await response.json() as { products: ProductSearchEntry[] };
      if (!Array.isArray(data.products)) throw new Error("search_invalid");
      cache = data.products; expiresAt = Date.now() + 60000; retryAfter = 0;
      return cache;
    } catch (error) { retryAfter = Date.now() + 15000; throw error; }
    finally { pending = null; }
  });
  return pending;
}
