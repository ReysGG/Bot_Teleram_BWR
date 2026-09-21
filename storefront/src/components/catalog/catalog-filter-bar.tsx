import { ProductSearchInput } from "./product-search-input";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";

export function CatalogFilterBar({
  query = "",
  sort = "featured",
  availability = "",
  category = "",
  categories = [],
}: {
  query?: string;
  sort?: string;
  availability?: string;
  category?: string;
  categories?: { slug: string; name: string }[];
}) {
  return (
    <form className="catalog-toolbar" action="/shop" method="get">
      <div className="catalog-search">
        <Icon aria-hidden="true" name="search" size={19} strokeWidth={2.2} />
        <ProductSearchInput label="Cari produk di katalog" defaultValue={query} />
      </div>
      <label className="sort-select mobile-category-select">
        <span>Kategori</span>
        <select defaultValue={category} name="category">
          <option value="">Semua kategori</option>
          {categories.map((group) => <option key={group.slug} value={group.slug}>{group.name}</option>)}
        </select>
      </label>
      <label className="sort-select">
        <span>Urutkan</span>
        <select defaultValue={sort} name="sort">
          <option value="featured">Pilihan utama</option>
          <option value="price-low">Harga terendah</option>
          <option value="price-high">Harga tertinggi</option>
          <option value="stock">Stok terbanyak</option>
        </select>
      </label>
      {availability ? <input name="availability" type="hidden" value={availability} /> : null}
      <button className="button button-primary" type="submit">Cari</button>
      {query || category || availability || sort !== "featured" ? <Link className="button button-quiet" href="/shop">Reset</Link> : null}
    </form>
  );
}
