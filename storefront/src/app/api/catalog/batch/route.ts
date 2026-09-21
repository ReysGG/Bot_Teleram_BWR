import { NextResponse, type NextRequest } from "next/server";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
export async function GET(request: NextRequest) {
  const ids = request.nextUrl.searchParams.get("ids")?.split(",") ?? [];
  if (!ids.length || ids.length > 12 || ids.some(id => !/^[A-Za-z0-9_-]{1,80}$/.test(id))) return NextResponse.json({ ok: false }, { status: 400 });
  const catalog = await loadCatalogSnapshot();
  if (catalog.source === "disconnected") return NextResponse.json({ ok: false }, { status: 503 });
  const products = new Map(catalog.products.map(product => [product.id, product]));
  return NextResponse.json({ products: [...new Set(ids)].flatMap(id => products.has(id) ? [products.get(id)!] : []) }, { headers: { "cache-control": "no-store" } });
}
