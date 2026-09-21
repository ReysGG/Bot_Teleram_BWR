import Image from "next/image";
import Link from "next/link";

export function CatalogEmptyState({
  mode,
  query,
}: {
  mode: "catalog" | "filter" | "search";
  query?: string;
}) {
  const search = query?.trim();
  const title = mode === "search"
    ? search ? `Produk "${search}" belum ditemukan.` : "Produk belum ditemukan."
    : mode === "filter"
      ? "Belum ada produk dengan filter ini."
      : "Belum ada produk yang tersedia.";
  const description = mode === "search"
    ? "Coba gunakan kata pencarian lain atau hapus pencarian untuk melihat semua produk."
    : mode === "filter"
      ? "Coba ubah kategori atau ketersediaan yang dipilih."
      : "Produk baru akan tampil di halaman ini saat sudah tersedia.";

  return (
    <div className={"empty-catalog catalog-empty-state empty-state-" + mode}>
      {mode === "search" ? (
        <div className="catalog-empty-visual">
          <Image
            alt="Robot sedang mencari produk"
            fill
            sizes="(max-width: 560px) 160px, 210px"
            src="/empty-states/product-not-found.png"
          />
        </div>
      ) : null}
      <div className="catalog-empty-copy">
        <strong>{title}</strong>
        <span>{description}</span>
        <div className="catalog-empty-actions">
          {mode !== "catalog" ? <Link className="button button-primary" href="/shop">Hapus filter</Link> : null}
          <Link className="button button-quiet" href="/categories">Lihat kategori</Link>
        </div>
      </div>
    </div>
  );
}
