import Link from "next/link";
import type { ReactNode } from "react";
import { ListFilter, Search } from "lucide-react";
import type { InventoryFilters } from "@/server/admin/inventory-query";

type FilterOption = { value: string; label: string };

export function InventoryFilterForm({
  action,
  dateLabel,
  extraFilterActive = false,
  extraFilters,
  filters,
  lifecycleOptions = [],
  products = [],
  showHealth = true,
  showProduct = true,
}: {
  action: string;
  dateLabel: string;
  extraFilterActive?: boolean;
  extraFilters?: ReactNode;
  filters: InventoryFilters;
  lifecycleOptions?: FilterOption[];
  products?: Array<{ id: string; name: string }>;
  showHealth?: boolean;
  showProduct?: boolean;
}) {
  const hasFilters = Boolean(
    filters.search ||
      filters.productId ||
      filters.lifecycle ||
      filters.health ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.sort !== "date" ||
      filters.direction !== "desc" ||
      extraFilterActive,
  );

  return (
    <form action={action} className="inventory-filter-form" method="get">
      <label className="inventory-filter-search">
        <span>Cari file</span>
        <input defaultValue={filters.search} name="q" placeholder="Nama file, produk, fingerprint, invoice..." type="search" />
      </label>
      {showProduct ? (
        <label>
          <span>Produk</span>
          <select defaultValue={filters.productId} name="product">
            <option value="">Semua produk</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
      ) : null}
      {lifecycleOptions.length > 0 ? (
        <label>
          <span>Lifecycle</span>
          <select defaultValue={filters.lifecycle} name="lifecycle">
            <option value="">Semua lifecycle</option>
            {lifecycleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      ) : null}
      {showHealth ? (
        <label>
          <span>Kesehatan</span>
          <select defaultValue={filters.health} name="health">
            <option value="">Semua kesehatan</option>
            <option value="HEALTHY">Sehat / terhubung</option>
            <option value="BANNED">Banned</option>
            <option value="ERROR">Check error</option>
            <option value="UNKNOWN">Belum dicek</option>
          </select>
        </label>
      ) : null}
      {extraFilters}
      <label>
        <span>{dateLabel} dari</span>
        <input defaultValue={filters.dateFrom} name="from" type="date" />
      </label>
      <label>
        <span>{dateLabel} sampai</span>
        <input defaultValue={filters.dateTo} name="to" type="date" />
      </label>
      <label>
        <span>Urutkan</span>
        <select defaultValue={filters.sort} name="sort">
          <option value="date">{dateLabel}</option>
          <option value="filename">Nama file</option>
          {showProduct ? <option value="product">Produk</option> : null}
          {lifecycleOptions.length > 0 ? <option value="lifecycle">Lifecycle</option> : null}
          {showHealth ? <option value="health">Kesehatan</option> : null}
        </select>
      </label>
      <label>
        <span>Arah</span>
        <select defaultValue={filters.direction} name="dir">
          <option value="desc">Terbaru / Z-A</option>
          <option value="asc">Terlama / A-Z</option>
        </select>
      </label>
      <div className="inventory-filter-actions">
        <Link className="button button-small button-ghost" href="/admin/inventory/search" prefetch={false}>Cari isi stok / pembeli</Link>
        <button className="button button-small" type="submit"><Search aria-hidden="true" size={16} /> Terapkan</button>
        {hasFilters ? <Link className="button button-small button-ghost" href={action} prefetch={false}>Reset</Link> : null}
        <span className="muted"><ListFilter aria-hidden="true" size={15} /> Sort berlaku ke seluruh halaman, bukan hanya 20 baris ini.</span>
      </div>
    </form>
  );
}
