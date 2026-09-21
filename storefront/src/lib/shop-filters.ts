export type ShopFilters = {
  q?: string;
  category?: string;
  availability?: string;
  sort?: string;
};

// Changing one filter preserves the other choices. Reset links use /shop directly.
export function shopFilterHref(current: ShopFilters, changes: ShopFilters): string {
  const next = { ...current, ...changes };
  const query = new URLSearchParams();
  for (const key of ["q", "category", "availability", "sort"] as const) {
    const value = next[key]?.trim();
    if (value && !(key === "sort" && value === "featured")) query.set(key, value);
  }
  return query.size ? `/shop?${query.toString()}` : "/shop";
}
