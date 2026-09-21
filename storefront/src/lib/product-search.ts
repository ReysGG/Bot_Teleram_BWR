import type { StorefrontProduct } from "./catalog-types";

export type ProductSearchEntry = Pick<StorefrontProduct, "id" | "slug" | "name" | "price" | "availability" | "featured"> & {
  category: string; variant: string; tags: string; keywords: string;
};
export function normalizeSearch(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\bchat\s+gpt\b/g, "chatgpt").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
export function productSearchEntry(product: StorefrontProduct): ProductSearchEntry {
  return { id: product.id, slug: product.slug, name: product.name, price: product.price,
    availability: product.availability, featured: product.featured, category: product.group?.name ?? "",
    variant: product.variantLabel ?? "", tags: product.tags.join(" "),
    keywords: [...new Set(normalizeSearch(product.description).split(" "))].slice(0, 120).join(" ") };
}

// Optimal-string-alignment distance: insertion, deletion, substitution, adjacent
// transposition. Bounded words/queries keep matching small and predictable.
export function typoDistance(left: string, right: string, maximum: number) {
  if (Math.abs(left.length - right.length) > maximum || left.length > 40 || right.length > 40) return maximum + 1;
  let older: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const row = [i];
    for (let j = 1; j <= right.length; j++) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) row[j] = Math.min(row[j], older[j - 2] + 1);
    }
    older = previous; previous = row;
  }
  return previous[right.length];
}

export function productSearchScore(entry: ProductSearchEntry, rawQuery: string) {
  const query = normalizeSearch(rawQuery.slice(0, 100));
  if (!query) return (entry.featured ? 4 : 0) + (entry.availability === "OUT_OF_STOCK" ? 0 : 1);
  const name = normalizeSearch(entry.name);
  if (name === query) return 1000;
  const fields = [[name + " " + normalizeSearch(entry.variant), 100], [normalizeSearch(entry.category), 55], [normalizeSearch(entry.tags), 45], [entry.keywords, 15]] as const;
  const tokens = query.split(" ").slice(0, 8);
  let total = name.startsWith(query) ? 220 : name.includes(query) ? 160 : 0;
  if (name.replaceAll(" ", "").includes(query.replaceAll(" ", ""))) total += 100;
  for (const token of tokens) {
    let best = 0;
    for (const [text, weight] of fields) {
      if (weight <= best) continue;
      const words = text.split(" ");
      if (words.includes(token)) best = Math.max(best, weight);
      else if (words.some(word => word.startsWith(token))) best = Math.max(best, weight * .85);
      else if (token.length >= 3 && text.includes(token)) best = Math.max(best, weight * .6);
      else if (token.length >= 4) {
        const allowance = token.length >= 8 ? 2 : 1;
        if (words.some(word => typoDistance(token, word, allowance) <= allowance)) best = Math.max(best, weight * .35);
      }
    }
    if (!best && !total) return 0;
    // Every query token must match; a phrase match already accounts for all tokens.
    if (!best && !name.replaceAll(" ", "").includes(query.replaceAll(" ", ""))) return 0;
    total += best;
  }
  return total;
}
export function recommendProducts(entries: ProductSearchEntry[], query: string, limit = 6) {
  return entries.map(entry => ({ entry, score: productSearchScore(entry, query) }))
    .filter(value => !query.trim() || value.score > 0)
    .sort((a, b) => b.score - a.score || Number(a.entry.availability === "OUT_OF_STOCK") - Number(b.entry.availability === "OUT_OF_STOCK") || a.entry.name.localeCompare(b.entry.name, "id"))
    .slice(0, limit).map(value => value.entry);
}
