import { productSearchEntry, productSearchScore } from "@/lib/product-search";
import Link from "next/link";
import { CatalogEmptyState } from "@/components/catalog/catalog-empty-state";
import { CatalogFilterBar } from "@/components/catalog/catalog-filter-bar";
import { CatalogFilterOption } from "@/components/catalog/catalog-filter-option";
import { LazyProductGrid } from "@/components/catalog/lazy-product-grid";
import { PageHeading } from "@/components/site/page-heading";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import type { StorefrontProduct } from "@/lib/catalog-types";
import { shopFilterHref, type ShopFilters } from "@/lib/shop-filters";

export const dynamic = "force-dynamic";

type ShopParams = ShopFilters;

function filterProducts(products: StorefrontProduct[], params: ShopParams) {
  const query = params.q?.trim().toLowerCase() ?? "";
  const category = params.category?.trim() ?? "";
  const availability = params.availability?.trim() ?? "";
  const scores = new Map(products.map(product => [product.id, query ? productSearchScore(productSearchEntry(product), query) : 0]));
  const filtered = products.filter((product) => {
    if (query && !scores.get(product.id)) return false;
    if (category && product.group?.slug !== category) return false;
    if (availability === "ready" && product.readyStock <= 0) return false;
    if (availability === "preorder" && product.availability !== "PREORDER") return false;
    if (availability === "out" && product.availability !== "OUT_OF_STOCK") return false;
    return true;
  });
  return filtered.sort((left, right) => {
    if (params.sort === "price-low") return left.price - right.price;
    if (params.sort === "price-high") return right.price - left.price;
    if (params.sort === "stock") return right.readyStock - left.readyStock;
    if (query) return (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
    return Number(right.featured) - Number(left.featured) || right.readyStock - left.readyStock;
  });
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<ShopParams>;
}) {
  const [catalog, params] = await Promise.all([loadCatalogSnapshot(), searchParams]);
  const products = filterProducts(catalog.products, params);
  const emptyMode = params.q?.trim()
    ? "search"
    : params.category || params.availability
      ? "filter"
      : "catalog";
  const availabilityLinks = [
    ["", "Semua status"],
    ["ready", "Stok tersedia"],
    ["preorder", "Preorder"],
    ["out", "Stok habis"],
  ] as const;

  return (
    <>
      <SiteHeader active="shop" />
      <main className="storefront-main">
        <PageHeading
          breadcrumbs={<><Link href="/">Home</Link> / Shop</>}
          description="Yuk, cari produk yang kamu inginkan. Gunakan pencarian dan filter untuk menemukan pilihan yang paling pas."
          imageAlt="Ilustrasi katalog produk digital"
          imageMode="background"
          imageUrl="/headings/shop-heading.png"
          title="Cari produk pilihanmu."
        />
        <nav className="mobile-shop-tabs page-width" aria-label="Filter cepat">
          <Link className={!params.availability ? "is-active" : ""} href={shopFilterHref(params, { availability: "" })}>Semua</Link>
          <Link className={params.availability === "ready" ? "is-active" : ""} href={shopFilterHref(params, { availability: "ready" })}>Tersedia</Link>
          <Link className={params.availability === "preorder" ? "is-active" : ""} href={shopFilterHref(params, { availability: "preorder" })}>Preorder</Link>
          <Link className={params.availability === "out" ? "is-active" : ""} href={shopFilterHref(params, { availability: "out" })}>Habis</Link>
        </nav>
        <section className="shop-layout page-width">
          <aside className="filter-sidebar">
            <div className="filter-title"><strong>Filter</strong><Link href="/shop">Reset</Link></div>
            <div className="filter-group">
              <strong>Kategori</strong>
              <CatalogFilterOption active={!params.category} href={shopFilterHref(params, { category: "" })} label="Semua kategori" />
              {catalog.groups.map((group) => (
                <CatalogFilterOption
                  active={params.category === group.slug}
                  count={group.productCount}
                  href={shopFilterHref(params, { category: group.slug })}
                  key={group.id}
                  label={group.name}
                />
              ))}
            </div>
            <div className="filter-group">
              <strong>Ketersediaan</strong>
              {availabilityLinks.map(([value, label]) => (
                <CatalogFilterOption
                  active={(params.availability ?? "") === value}
                  href={shopFilterHref(params, { availability: value })}
                  key={value || "all"}
                  label={label}
                />
              ))}
            </div>
          </aside>
          <div className="shop-content">
            <div className="shop-results-heading">
              <strong>{products.length} produk</strong>
              <span>{params.category ? catalog.groups.find((group) => group.slug === params.category)?.name ?? "Kategori tidak ditemukan" : "Semua kategori"}</span>
            </div>
            <CatalogFilterBar
              key={[params.q, params.category, params.availability, params.sort].join("|")}
              availability={params.availability}
              category={params.category}
              categories={catalog.groups}
              query={params.q}
              sort={params.sort}
            />
            {products.length > 0 ? (
              <LazyProductGrid key={JSON.stringify(params)} initialProducts={products.slice(0, 12)} orderedIds={products.map(product => product.id)} />
            ) : (
              <CatalogEmptyState mode={emptyMode} query={params.q} />
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
