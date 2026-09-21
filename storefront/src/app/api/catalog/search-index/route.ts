import { NextResponse } from "next/server";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import { productSearchEntry } from "@/lib/product-search";
export async function GET() {
  const catalog = await loadCatalogSnapshot();
  if (catalog.source === "disconnected") return NextResponse.json({ ok: false }, { status: 503, headers: { "cache-control": "no-store" } });
  return NextResponse.json({ generatedAt: catalog.generatedAt, products: catalog.products.map(productSearchEntry) }, {
    headers: { "cache-control": "public, max-age=60", "x-content-type-options": "nosniff" },
  });
}
