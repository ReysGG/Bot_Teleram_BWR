import Link from "next/link";
import {
  Boxes,
  PackageOpen,
  PackageSearch,
  Pencil,
  ShieldBan,
  EyeOff,
} from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminMetricCard,
  AdminMetricGrid,
  AdminPagination,
  AdminPanel,
  AdminPanelHeading,
  AdminStatusPill,
  AdminTable,
} from "@/components/admin/admin-ui";

import { ProductDeleteForm } from "@/components/admin/product-delete-form";
import { ProductImageThumbnail } from "@/components/admin/product-image-thumbnail";
import { ProductStatusAction } from "@/components/admin/product-status-action";
import { Prisma } from "@/generated/prisma/client";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { productSearchWhere } from "@/server/admin/catalog-search";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { isSellableStock, sellableStockWhere } from "@/server/stock/sellable";
import { buildAdminReturnPath } from "@/server/admin/return-path";
import { PRODUCT_FORM_ERROR_MESSAGES } from "@/lib/admin-product-form-errors";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  "product-created": "Produk berhasil dibuat dan notifikasi pelanggan masuk antrean.",
  "product-edited": "Nama, harga, deskripsi, dan pengaturan produk berhasil diperbarui.",
  "product-updated": "Status produk berhasil diperbarui.",
  "product-deleted": "Produk berhasil dihapus permanen.",
  "product-deactivated": "Produk dinonaktifkan. Riwayat order dan pengiriman tetap tersimpan.",
  "product-activated": "Produk berhasil diaktifkan kembali.",
  "preorder-updated": "Pengaturan preorder diperbarui.",
};

const errorMessages: Record<string, string> = {
  ...PRODUCT_FORM_ERROR_MESSAGES,
  "product-status": "Status produk gagal diperbarui.",
  "product-delete":
    "Produk tidak dapat dihapus karena masih memiliki stok terlindungi atau riwayat aktif.",
  preorder: "Pengaturan preorder tidak valid. Isi estimasi dan batas antrean.",
  "stock-product-required": "Pilih produk sebelum upload stok.",
  "stock-product-missing": "Produk yang dipilih sudah tidak tersedia.",
  "stock-file-count": "Tambahkan minimal satu file atau baris stok. Satu proses dapat menghasilkan hingga 5.000 stok.",
  "stock-empty": "Salah satu file stok kosong.",
  "stock-lines-too-large": "Teks stok melebihi 1 MB. Pecah menjadi beberapa proses upload.",
  "stock-too-large": "Salah satu file melebihi batas 64 KB.",
  "stock-encryption-key": "Kunci enkripsi stok server tidak valid.",
  "stock-duplicate": "File atau credential yang sama sudah tersimpan.",
  "stock-upload": "Upload stok gagal.",
  "stock-check": "Pemeriksaan stok gagal.",
  "check-rate": "Checker terlalu sering dijalankan. Tunggu sebentar.",
};

function resolveNotice(params: { notice?: string; allocated?: string }) {
  if (!params.notice) return null;
  if (params.notice.startsWith("checked-")) {
    const [, checked, healthy, banned, errors] = params.notice.split("-");
    const allocated = Number.parseInt(params.allocated ?? "0", 10) || 0;
    return `Checker selesai: ${checked} diperiksa, ${healthy} sehat, ${banned} banned, ${errors} error, ${allocated} dialokasikan ke preorder.`;
  }
  return noticeMessages[params.notice] ?? "Operasi produk selesai.";
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string;
    error?: string;
    allocated?: string;
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
      productSearchWhere(search),
      { status: "ACTIVE" },
      groupFilter === "standalone"
        ? { groupId: null }
        : groupFilter
          ? { groupId: groupFilter }
          : {},
    ],
  };
  // Summary queries and the paginated ledger are independent. Do not make the
  // ledger wait for every sidebar/global aggregate before it can start loading.
  const overviewPromise = Promise.all([
    getAdminInventoryCounts(),
    prisma.product.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.digitalStockItem.count({
      where: { archivedAt: null, status: "AVAILABLE", ...sellableStockWhere() },
    }),
    prisma.productGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, status: true },
    }),
  ]);
  const totalItems = await prisma.product.count({ where });
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 15);
  const products = await prisma.product.findMany({
    where,
    orderBy: sort === "name"
      ? [{ name: direction }, { id: "asc" }]
      : sort === "price"
        ? [{ price: direction }, { name: "asc" }]
        : sort === "group"
            ? [{ group: { name: direction } }, { groupSortOrder: "asc" }, { name: "asc" }]
            : [{ createdAt: direction }, { id: "asc" }],
    skip: pagination.skip,
    take: pagination.take,
    select: {
      id: true,
      name: true,
      price: true,
      status: true,
      variantLabel: true,
      bannedStockPolicy: true,
      preorderEnabled: true,
      preorderEtaText: true,
      preorderLimit: true,
      attachmentOriginalFilename: true,
      group: { select: { id: true, name: true, status: true } },
      _count: { select: { stockItems: true, orderItems: true } },
    },
  });
  const productIds = products.map((product) => product.id);
  const [stockGroups, preorderGroups] = productIds.length
    ? await Promise.all([
        prisma.digitalStockItem.groupBy({
          by: ["productId", "status", "healthStatus", "healthHttpStatus", "bannedSaleApprovedAt"],
          where: { productId: { in: productIds }, archivedAt: null },
          _count: { _all: true },
        }),
        prisma.orderItem.groupBy({
          by: ["productId"],
          where: {
            productId: { in: productIds },
            stockItemId: null,
            order: {
              isPreorder: true,
              status: { in: ["PENDING_PAYMENT", "PAID_WAITING_STOCK"] },
            },
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  const stockCounts = new Map<string, { ready: number; sold: number; banned: number }>();
  stockGroups.forEach((group) => {
    const current = stockCounts.get(group.productId) ?? { ready: 0, sold: 0, banned: 0 };
    const product = products.find((item) => item.id === group.productId);
    const sellable = product
      ? isSellableStock({
          healthStatus: group.healthStatus,
          healthHttpStatus: group.healthHttpStatus,
          bannedSaleApprovedAt: group.bannedSaleApprovedAt,
          bannedStockPolicy: product.bannedStockPolicy,
        })
      : false;
    if (group.status === "AVAILABLE" && sellable) current.ready += group._count._all;
    if (group.status === "DELIVERED") current.sold += group._count._all;
    if (group.status === "BANNED" || group.healthStatus === "BANNED") current.banned += group._count._all;
    stockCounts.set(group.productId, current);
  });
  const preorderCounts = new Map(
    preorderGroups.map((group) => [group.productId, group._count._all]),
  );
  const [counts, productStatusGroups, readyCount, productGroups] = await overviewPromise;
  const totalProducts = productStatusGroups.reduce((sum, group) => sum + group._count._all, 0);
  const activeCount = productStatusGroups.find((group) => group.status === "ACTIVE")?._count._all ?? 0;
  const bannedCount = counts.banned;
  const notice = resolveNotice(query);
  const productListQuery = {
    q: search || undefined,
    group: groupFilter || undefined,
    sort: sort === "date" ? undefined : sort,
    dir: direction === "desc" ? undefined : direction,
    page: pagination.page > 1 ? pagination.page : undefined,
  };
  const returnTo = buildAdminReturnPath({
    pathname: "/admin/products",
    query: productListQuery,
    fragment: "product-list",
  });

  return (
    <AdminShell
      active="products"
      counts={counts}
      description="Kelola produk aktif, harga, media, panduan, preorder, dan stok. Produk nonaktif memiliki halaman operasional tersendiri."
      email={admin.email}
      eyebrow="Catalog control"
      title="Produk"
    >
      {notice ? (
        <AdminResultModal
          message={notice}
          tone="success"
        />
      ) : null}
      {query.error ? (
        <AdminResultModal
          message={errorMessages[query.error] ?? "Operasi produk gagal."}
          tone="error"
        />
      ) : null}

      <div className="product-page-toolbar">
        <div>
          <strong>Kelola katalog aktif dari sini.</strong>
          <span className="muted">Produk yang dinonaktifkan otomatis dipindahkan ke halaman terpisah.</span>
        </div>
        <div className="product-row-actions">
          <Link className="button button-ghost" href="/admin/products/inactive" prefetch={false}>
            <EyeOff aria-hidden="true" size={17} /> Produk nonaktif
          </Link>
          <Link className="button button-primary" href="/admin/products/new" prefetch={false}>Tambah produk</Link>
        </div>
      </div>

      <AdminMetricGrid className="product-metrics">
        <AdminMetricCard
          accent="accent-orange"
          icon={<Boxes aria-hidden="true" />}
          label="Total produk"
          value={totalProducts}
        />
        <AdminMetricCard
          accent="accent-green"
          icon={<PackageOpen aria-hidden="true" />}
          label="Produk aktif"
          value={activeCount}
        />
        <AdminMetricCard
          accent="accent-yellow"
          icon={<PackageSearch aria-hidden="true" />}
          label="File siap"
          value={readyCount}
        />
        <AdminMetricCard
          accent="accent-red"
          icon={<ShieldBan aria-hidden="true" />}
          label="Banned"
          value={bannedCount}
        />
      </AdminMetricGrid>

      <div id="product-list">
      <AdminPanel wide>
        <AdminPanelHeading
          eyebrow="Katalog"
          icon={<PackageSearch aria-hidden="true" />}
          title="Daftar produk"
          trailing={(
            <>
              <span className="muted">Harga baru hanya berlaku untuk checkout berikutnya.</span>
              <form action="/admin/products#product-list" className="admin-search-form" method="get">
                <input defaultValue={search} name="q" placeholder="Cari parent, varian, nama, atau slug..." type="search" />
                <select defaultValue={groupFilter} name="group">
                  <option value="">Semua grup</option>
                  <option value="standalone">Standalone</option>
                  {productGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
                <select defaultValue={sort} name="sort">
                  <option value="date">Tanggal</option>
                  <option value="group">Parent & urutan varian</option>
                  <option value="name">Nama</option>
                  <option value="price">Harga</option>
                </select>
                <select defaultValue={direction} name="dir"><option value="desc">Turun</option><option value="asc">Naik</option></select>
                <button className="button button-small" type="submit">Terapkan</button>
                {search || groupFilter || sort !== "date" || direction !== "desc" ? <Link className="button button-small button-ghost" href="/admin/products#product-list" prefetch={false}>Reset</Link> : null}
              </form>
            </>
          )}
        />
        <AdminTable>
            <thead>
              <tr>
                <th>Produk</th>
                <th>Harga</th>
                <th>Stok</th>
                <th>Preorder</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const { ready, sold, banned } = stockCounts.get(product.id) ?? {
                  ready: 0,
                  sold: 0,
                  banned: 0,
                };
                const preorderCount = preorderCounts.get(product.id) ?? 0;
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="product-list-identity">
                        <ProductImageThumbnail productId={product.id} name={product.name} />
                        <div>
                          <strong>{product.name}</strong>
                          <small>
                        {product.status}
                        {product.group
                          ? ` / ${product.group.name} / ${product.variantLabel ?? product.name}`
                          : " / Standalone"}
                        {product.attachmentOriginalFilename ? ` · 📎 ${product.attachmentOriginalFilename}` : ""}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{formatRupiah(product.price)}</td>
                    <td>
                      <div className="product-stock-summary">
                        <AdminStatusPill tone="good">Siap {ready}</AdminStatusPill>
                        <AdminStatusPill>Terjual {sold}</AdminStatusPill>
                        <AdminStatusPill tone={banned > 0 ? "bad" : "neutral"}>
                          Banned {banned}
                        </AdminStatusPill>
                      </div>
                    </td>
                    <td>
                      <strong>{preorderCount} antre</strong>
                      <small>
                        {product.preorderEnabled
                          ? `${product.preorderEtaText ?? "Tanpa estimasi"} · limit ${product.preorderLimit ?? "-"}`
                          : "Nonaktif"}
                      </small>
                    </td>
                    <td>
                      <div className="product-row-actions">
                        <Link className="button button-small" href={`/admin/products/${product.id}/edit`} prefetch={false}>
                          <Pencil aria-hidden="true" size={15} /> Edit
                        </Link>
                        <Link className="button button-small" href={`/admin/products/${product.id}/stock`} prefetch={false}>
                          <PackageSearch aria-hidden="true" size={15} /> Gudang
                        </Link>
                        <ProductStatusAction
                          failureReturnTo={returnTo}
                          id={product.id}
                          name={product.name}
                          returnTo="/admin/products/inactive#product-list"
                          status={product.status}
                        />
                        <ProductDeleteForm
                          hasOrderHistory={product._count.orderItems > 0}
                          id={product.id}
                          name={product.name}
                          status={product.status}
                          stockCount={product._count.stockItems}
                          hideDeactivate
                          returnTo={returnTo}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
        </AdminTable>
        <AdminPagination
          ariaLabel="Pagination produk"
          basePath="/admin/products"
          currentPage={pagination.page}
          fragment="product-list"
          itemLabel="produk"
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
