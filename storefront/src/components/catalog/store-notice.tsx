import type { StorefrontCatalogSnapshot } from "@/lib/catalog-types";

export function StoreNotice({ source }: { source: StorefrontCatalogSnapshot["source"] }) {
  void source;
  return null;
}
