import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/catalog/product-card";
import { PageHeading } from "@/components/site/page-heading";
import { SectionHeading } from "@/components/site/section-heading";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import { formatRupiah } from "@/lib/catalog-types";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [catalog, route] = await Promise.all([loadCatalogSnapshot(), params]);
  const group = catalog.groups.find((item) => item.slug === route.slug);
  if (!group && catalog.source !== "disconnected") notFound();
  const products = catalog.products.filter((product) => product.group?.slug === route.slug);

  return (
    <>
      <SiteHeader active="categories" />
      <main className="storefront-main">
        <PageHeading
          action={(
            <div className="category-hero-stat">
              <strong>{group?.availableCount ?? 0}</strong>
              <span>produk tersedia</span>
              <small>{group?.minPrice ? "Mulai " + formatRupiah(group.minPrice) : "Harga belum tersedia"}</small>
            </div>
          )}
          breadcrumbs={<><Link href="/">Home</Link> / <Link href="/categories">Kategori</Link> / {group?.name ?? route.slug}</>}
          description={group
            ? "Yuk, lihat pilihan " + group.name + " yang tersedia dan pilih varian yang paling cocok untukmu."
            : "Yuk, pilih produk yang paling cocok untuk kebutuhanmu."}
          imageAlt={group ? "Visual kategori " + group.name : "Ilustrasi kategori produk digital"}
          imageFit={group?.imageUrl ? "cover" : "contain"}
          imageMode={group?.imageUrl ? "split" : "background"}
          imageTreatment={group?.imageUrl ? "default" : "natural"}
          imageUrl={group?.imageUrl ?? "/headings/category-heading-banner.webp"}
          title={group?.name ?? "Kategori"}
        />
        <section className="section-block page-width">
          <SectionHeading actionHref="/shop" actionLabel="Semua produk" title={products.length + " pilihan"} />
          {products.length > 0 ? (
            <div className="product-grid">
              {products.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="empty-catalog"><strong>Belum ada produk di kategori ini.</strong><span>Coba lihat kategori lain atau kembali lagi nanti.</span></div>
          )}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
