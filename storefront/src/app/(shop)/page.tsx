import { ProductSearchInput } from "@/components/catalog/product-search-input";
import { CategoryCard } from "@/components/catalog/category-card";
import Image from "next/image";
import { ProductCarousel } from "@/components/catalog/product-carousel";
import { SiteFooter } from "@/components/site/site-footer";
import { SectionHeading } from "@/components/site/section-heading";
import { SiteHeader } from "@/components/site/site-header";
import { WhyChooseSection } from "@/components/site/why-choose-section";
import { Icon } from "@/components/ui/icon";
import { loadCatalogSnapshot } from "@/lib/catalog-model";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const catalog = await loadCatalogSnapshot();
  const featured = [...catalog.products.filter(product => product.featured), ...catalog.products.filter(product => !product.featured)].slice(0, 10);
  const popularGroups = catalog.groups.slice(0, 4);

  return (
    <>
      <SiteHeader active="home" />
      <main className="storefront-main home-page" data-no-motion>
        <section className="home-hero-band">
          <div className="home-hero page-width">
            <div className="home-hero-copy">
              <h1>Produk digital untuk <span>kerja dan kreativitas.</span></h1>
              <p className="hero-description">
                Cari produk digital yang kamu butuhkan, cek stoknya, lalu selesaikan
                pembelian langsung di sini.
              </p>
              <form className="hero-search" action="/shop" method="get">
                <Icon aria-hidden="true" name="search" size={20} strokeWidth={2.2} />
                <ProductSearchInput label="Cari produk pilihanmu" />
                <button type="submit">Lihat produk <Icon aria-hidden="true" name="arrow-right" size={17} /></button>
              </form>
              <div className="hero-proof">
                <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Stok jelas</span>
                <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Bayar aman</span>
                <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Kirim privat</span>
              </div>
            </div>
            <div className="home-hero-art" aria-hidden="true"><Image src="/hero-ai-workspace.png" alt="" fill priority sizes="100vw" /></div>
          </div>
        </section>

        <section className="section-block page-width">
          {featured.length > 0 ? (
            <ProductCarousel products={featured} title="Produk populer" />
          ) : (
            <div className="empty-catalog"><strong>Belum ada produk untuk ditampilkan.</strong><span>Coba kembali lagi nanti untuk melihat pilihan terbaru.</span></div>
          )}
        </section>

        <section className="section-block page-width">
          <SectionHeading actionHref="/categories" actionLabel="Lihat semua" title="Kategori pilihan" />
          <div className="category-grid">
            {popularGroups.map((group, index) => <CategoryCard key={group.id} group={group} index={index} />)}
          </div>
        </section>

        <WhyChooseSection />
      </main>
      <SiteFooter />
    </>
  );
}
