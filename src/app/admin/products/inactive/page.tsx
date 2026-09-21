import Link from "next/link";
import { ArchiveX, Boxes, PackageSearch, Pencil, RotateCcw } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminMetricCard,
  AdminMetricGrid,
  AdminPagination,
  AdminPanel,
  AdminPanelHeading,
  AdminTable,
} from "@/components/admin/admin-ui";
import { ProductDeleteForm } from "@/components/admin/product-delete-form";
import { ProductImageThumbnail } from "@/components/admin/product-image-thumbnail";
import { ProductStatusAction } from "@/components/admin/product-status-action";
import { Prisma } from "@/generated/prisma/client";
import { productSearchWhere } from "@/server/admin/catalog-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export const dynamic = "force-dynamic";

const notices: Record<string, string> = {
  "product-activated": "Produk berhasil diaktifkan kembali dan dipindahkan ke daftar produk aktif.",
  "product-deactivated": "Produk berhasil dinonaktifkan dan dipindahkan ke halaman ini.",
  "product-deleted": "Produk nonaktif berhasil dihapus permanen.",
};

const errors: Record<string, string> = {
  "product-status": "Produk gagal diaktifkan kembali.",
  "product-delete": "Produk tidak dapat dihapus karena stok atau histori transaksinya dilindungi.",
  product: "Operasi produk gagal diproses.",
};

export default async function InactiveProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    page?: string;
    q?: string;
    group?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const groupFilter = query.group?.trim() ?? "";
  const sort = ["date", "name", "price", "group"].includes(query.sort ?? "")
    ? query.sort as "date" | "name" | "price" | "group"
    : "date";
  const direction = query.dir === "asc" ? "asc" as const : "desc" as const;
  const where: Prisma.ProductWhereInput = {
    AND: [
      { status: "INACTIVE" },
      productSearchWhere(search),
      groupFilter === "standalone"
        ? { groupId: null }
        : groupFilter
          ? { groupId: groupFilter }
          : {},
    ],
  };

  const [counts, totalItems, stockCount, orderCount, productGroups] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.count({ where }),
    prisma.digitalStockItem.count({ where: { product: { status: "INACTIVE" } } }),
    prisma.orderItem.count({ where: { product: { status: "INACTIVE" } } }),
    prisma.productGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, status: true },
    }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 15);
  const products = await prisma.product.findMany({
    where,
    orderBy: sort === "name"
      ? [{ name: direction }, { id: "asc" }]
      : sort === "price"
        ? [{ price: direction }, { name: "asc" }]
        : sort === "group"
          ? [{ group: { name: direction } }, { groupSortOrder: "asc" }, { name: "asc" }]
          : [{ updatedAt: direction }, { id: "asc" }],
    skip: pagination.skip,
    take: pagination.take,
    select: {
      id: true,
      name: true,
      price: true,
      status: true,
      updatedAt: true,
      variantLabel: true,
      attachmentOriginalFilename: true,
      group: { select: { id: true, name: true, status: true } },
      _count: { select: { stockItems: true, orderItems: true } },
    },
  });
  const productListQuery = {
    q: search || undefined,
    group: groupFilter || undefined,
    sort: sort === "date" ? undefined : sort,
    dir: direction === "desc" ? undefined : direction,
    page: pagination.page > 1 ? pagination.page : undefined,
  };
  const returnTo = buildAdminReturnPath({
    pathname: "/admin/products/inactive",
    query: productListQuery,
    fragment: "product-list",
  });

  return (
    <AdminShell
      active="inactiveProducts"
      counts={counts}
      description="Produk yang disembunyikan dari checkout baru. Aktifkan kembali dari halaman ini tanpa mengubah stok atau riwayat transaksi."
      email={admin.email}
      eyebrow="Catalog archive"
      title="Produk nonaktif"
    >
      {query.notice ? <AdminResultModal message={notices[query.notice] ?? "Operasi produk selesai."} tone="success" /> : null}
      {query.error ? <AdminResultModal message={errors[query.error] ?? "Operasi produk gagal."} tone="error" /> : null}

      <div className="product-page-toolbar">
        <div>
          <strong>Status produk dipisahkan dari CRUD aktif.</strong>
          <span className="muted">Order lama, file stok, dan bukti pengiriman tetap dilindungi.</span>
        </div>
        <Link className="button button-primary" href="/admin/products" prefetch={false}>
          <RotateCcw aria-hidden="true" size={17} /> Kembali ke produk aktif
        </Link>
      </div>

      <AdminMetricGrid className="product-metrics">
        <AdminMetricCard accent="accent-red" icon={<ArchiveX aria-hidden="true" />} label="Produk nonaktif" value={totalItems} />
        <AdminMetricCard accent="accent-yellow" icon={<Boxes aria-hidden="true" />} label="File stok tersimpan" value={stockCount} />
        <AdminMetricCard accent="accent-green" icon={<PackageSearch aria-hidden="true" />} label="Riwayat order" value={orderCount} />
      </AdminMetricGrid>

      <div id="product-list">
      <AdminPanel wide>
        <AdminPanelHeading
          eyebrow="Inactive catalog"
          icon={<ArchiveX aria-hidden="true" />}
          title="Daftar produk nonaktif"
          trailing={(
            <form action="/admin/products/inactive#product-list" className="admin-search-form" method="get">
              <input defaultValue={search} name="q" placeholder="Cari produk, varian, slug, atau panduan..." type="search" />
              <select defaultValue={groupFilter} name="group">
                <option value="">Semua grup</option>
                <option value="standalone">Standalone</option>
                {productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select defaultValue={sort} name="sort">
                <option value="date">Terakhir diubah</option>
                <option value="group">Parent & urutan varian</option>
                <option value="name">Nama</option>
                <option value="price">Harga</option>
              </select>
              <select defaultValue={direction} name="dir"><option value="desc">Turun</option><option value="asc">Naik</option></select>
              <button className="button button-small" type="submit">Terapkan</button>
              {search || groupFilter || sort !== "date" || direction !== "desc"
                ? <Link className="button button-small button-ghost" href="/admin/products/inactive#product-list" prefetch={false}>Reset</Link>
                : null}
            </form>
          )}
        />
        <AdminTable>
          <thead>
            <tr><th>Produk</th><th>Harga</th><th>Data terlindungi</th><th>Terakhir diubah</th><th>Aksi</th></tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>
                  <div className="product-list-identity">
                    <ProductImageThumbnail productId={product.id} name={product.name} />
                    <div>
                      <strong>{product.name}</strong>
                      <small>
                        {product.group ? `${product.group.name} / ${product.variantLabel ?? product.name}` : "Standalone"}
                        {product.attachmentOriginalFilename ? ` / panduan: ${product.attachmentOriginalFilename}` : ""}
                      </small>
                    </div>
                  </div>
                </td>
                <td>{formatRupiah(product.price)}</td>
                <td><strong>{product._count.stockItems} stok</strong><small>{product._count.orderItems} riwayat order</small></td>
                <td>{product.updatedAt.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td>
                <td>
                  <div className="product-row-actions">
                    <ProductStatusAction
                      failureReturnTo={returnTo}
                      id={product.id}
                      name={product.name}
                      returnTo="/admin/products#product-list"
                      status={product.status}
                    />
                    <Link className="button button-small" href={`/admin/products/${product.id}/edit`} prefetch={false}><Pencil aria-hidden="true" size={15} /> Kelola</Link>
                    <Link className="button button-small" href={`/admin/products/${product.id}/stock`} prefetch={false}><PackageSearch aria-hidden="true" size={15} /> Gudang</Link>
                    <ProductDeleteForm
                      hasOrderHistory={product._count.orderItems > 0}
                      id={product.id}
                      name={product.name}
                      returnTo={returnTo}
                      status={product.status}
                      stockCount={product._count.stockItems}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
        <AdminPagination
          ariaLabel="Pagination produk nonaktif"
          basePath="/admin/products/inactive"
          currentPage={pagination.page}
          fragment="product-list"
          itemLabel="produk nonaktif"
          pageSize={pagination.pageSize}
          query={{
            q: search || undefined,
            group: groupFilter || undefined,
            sort: sort === "date" ? undefined : sort,
            dir: direction === "desc" ? undefined : direction,
          }}
          totalItems={pagination.totalItems}
        />
      </AdminPanel>
      </div>
    </AdminShell>
  );
}
