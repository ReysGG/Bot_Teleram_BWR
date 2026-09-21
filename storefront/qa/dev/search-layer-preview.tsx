import { ProductSearchInput } from "../../src/components/catalog/product-search-input";
import { ProductCarousel } from "../../src/components/catalog/product-carousel";
import { Icon } from "../../src/components/ui/icon";
import type { StorefrontProduct } from "../../src/lib/catalog-types";

export function SearchLayerPreview({ products }: { products: StorefrontProduct[] }) {
  return <main className="storefront-main home-page" data-no-motion>
    <section className="home-hero-band"><div className="home-hero page-width"><div className="home-hero-copy">
      <h1>Produk digital untuk <span>kerja dan kreativitas.</span></h1>
      <p className="hero-description">Preview pencarian di atas carousel. Semua produk menggunakan data contoh.</p>
      <form className="hero-search" action="/shop" method="get"><Icon name="search" size={20} /><ProductSearchInput label="Cari produk pilihanmu" /><button type="submit">Lihat produk</button></form>
      <div className="hero-proof"><span>Stok jelas</span><span>Bayar aman</span><span>Kirim privat</span></div>
    </div></div></section>
    <section className="section-block page-width"><ProductCarousel products={products} title="Produk populer" /></section>
  </main>;
}
