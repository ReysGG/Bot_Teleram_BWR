import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Boxes,
  Download,
  LockKeyhole,
  PackageOpen,
  ShieldBan,
  UploadCloud,
} from "lucide-react";
import { notFound } from "next/navigation";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryFilterForm } from "@/components/admin/inventory-filter-form";
import { InventoryTable } from "@/components/admin/inventory-table";
import { StockUploadForm } from "@/components/admin/stock-upload-form";
import { Prisma } from "@/generated/prisma/client";
import { inventorySearchWhere } from "@/server/admin/catalog-search";
import {
  getAdminInventoryCounts,
  summarizeProductStockGroups,
  stockUploadNotice,
  type StockUploadNoticeParams,
} from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import {
  inventoryFilterQuery,
  inventoryFilterWhere,
  inventoryOrderBy,
  parseInventoryFilters,
  type InventoryFilterParams,
} from "@/server/admin/inventory-query";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export const dynamic = "force-dynamic";

const noticeMessages: Record<string, string> = {
  archived: "Stok berhasil diarsipkan.",
  restored: "Stok berhasil dipulihkan.",
  deleted: "Stok berhasil dihapus permanen.",
  "stock-edited": "Stok archived berhasil diperbarui dan dienkripsi ulang.",
  "stock-edited-healthy": "Stok berhasil diperbarui, dienkripsi ulang, dan dinyatakan sehat.",
  "stock-edited-banned": "Stok berhasil diperbarui, tetapi health check menghasilkan HTTP 401/402.",
  "stock-edited-error": "Stok berhasil diperbarui, tetapi checker mengalami error.",
  "stock-edited-check-failed": "Stok berhasil diperbarui, tetapi proses check ulang belum selesai.",
  "checked-healthy": "Pemeriksaan selesai: akun sehat.",
  "checked-banned": "Pemeriksaan selesai: akun menghasilkan HTTP 401/402.",
  "checked-error": "Pemeriksaan selesai, tetapi checker mengalami error.",
};

const uploadErrorMessages: Record<string, string> = {
  "stock-product-required": "Produk tujuan upload tidak ditemukan.",
  "stock-product-missing": "Produk ini sudah tidak tersedia.",
  "stock-file-count": "Tambahkan minimal satu file atau baris stok. Satu proses dapat menghasilkan hingga 5.000 stok.",
  "stock-empty": "Salah satu file stok kosong.",
  "stock-lines-too-large": "Teks stok melebihi 1 MB. Pecah menjadi beberapa proses upload.",
  "stock-too-large": "Salah satu file melebihi batas 64 KB.",
  "stock-encryption-key": "Kunci enkripsi stok server tidak valid.",
  "stock-duplicate": "File atau credential yang sama sudah tersimpan.",
  "stock-download-empty": "Belum ada stok yang dapat dimasukkan ke ZIP.",
  "stock-download-limit": "ZIP terlalu besar. Download stok terpilih dalam beberapa batch agar server tetap stabil.",
  "stock-download-missing": "Sebagian stok berubah atau sudah tidak tersedia. Muat ulang halaman lalu coba lagi.",
  "stock-download-unavailable": "ZIP gagal dibuat karena ada stok yang tidak dapat didekripsi.",
  "stock-upload": "Upload stok gagal.",
};

export default async function ProductStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<StockUploadNoticeParams & InventoryFilterParams & { error?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [counts, product] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        bannedStockPolicy: true,
        _count: { select: { stockItems: true } },
      },
    }),
  ]);
  if (!product) notFound();

  const filters = { ...parseInventoryFilters(query), productId: "" };
  const search = normalizeAdminSearch(filters.search);
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      { productId: product.id },
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "createdAt"),
    ],
  };
  const totalItems = await prisma.digitalStockItem.count({ where });
  const pagination = adminPagination(
    totalItems,
    parseAdminPage(query.page),
  );
  const [stockGroups, approvedAvailableBanned, records] = await Promise.all([
    prisma.digitalStockItem.groupBy({
      by: ["status", "healthStatus", "healthHttpStatus"],
      where: { productId: product.id, archivedAt: null },
      _count: { _all: true },
    }),
    product.bannedStockPolicy === "OWNER_APPROVAL"
      ? prisma.digitalStockItem.count({
          where: {
            productId: product.id,
            archivedAt: null,
            status: "AVAILABLE",
            healthStatus: "BANNED",
            bannedSaleApprovedAt: { not: null },
          },
        })
      : Promise.resolve(0),
    prisma.digitalStockItem.findMany({
      where,
      include: {
        orderItem: {
          include: { order: { select: { invoiceNumber: true } } },
        },
      },
      orderBy: inventoryOrderBy(filters, "createdAt"),
      skip: pagination.skip,
      take: pagination.take,
    }),
  ]);
  const { ready, reserved, sold, banned } = summarizeProductStockGroups(
    stockGroups,
    product.bannedStockPolicy,
    undefined,
    approvedAvailableBanned,
  );
  const items = records.map((item) => ({
    ...item,
    product: { name: product.name },
    invoiceNumber:
      item.status === "DELIVERED" ? item.orderItem?.order.invoiceNumber : null,
  }));
  const returnTo = `/admin/products/${product.id}/stock` as const;
  const actionReturnTo = buildAdminReturnPath({
    pathname: returnTo,
    query: {
      ...inventoryFilterQuery(filters),
      page: pagination.page > 1 ? pagination.page : undefined,
    },
    fragment: "inventory-ledger",
  });
  const uploadNotice = stockUploadNotice(query);
  const uploadedCount = Number.parseInt(query.imported ?? "0", 10) || 0;
  const skippedCount = Number.parseInt(query.skipped ?? "0", 10) || 0;
  const actionNotice = query.notice
    ? noticeMessages[query.notice] ?? "Operasi stok selesai."
    : null;

  return (
    <AdminShell
      active="products"
      counts={counts}
      description={`Seluruh file akun untuk ${product.name}. Data sehat, reserved, terjual, banned, dan arsip terlihat dalam satu halaman.`}
      email={admin.email}
      eyebrow="Product warehouse"
      title="Gudang stok"
    >
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href="/admin/products" prefetch={false}>
          <ArrowLeft aria-hidden="true" size={17} />
          Kembali ke produk
        </Link>
        <div className="product-row-actions">
          <span className="muted">{product.name}</span>
          <form action="/api/admin/inventory/download" method="post">
            <input name="productId" type="hidden" value={product.id} />
            <input name="returnTo" type="hidden" value={actionReturnTo} />
            <button
              className="button button-small"
              disabled={product._count.stockItems === 0}
              title="ZIP berisi semua stok produk ini, termasuk reserved, terjual, banned, dan arsip."
              type="submit"
            >
              <Download aria-hidden="true" size={15} />
              Download semua stok
            </button>
          </form>
        </div>
      </div>

      {uploadNotice || actionNotice ? (
        <AdminResultModal
          message={uploadNotice ?? actionNotice ?? "Operasi stok selesai."}
          tone="success"
          eyebrow={
            uploadedCount === 0 && skippedCount > 0
              ? "Duplikat dicegah"
              : uploadedCount > 0
                ? "Upload berhasil"
                : undefined
          }
          title={
            uploadedCount === 0 && skippedCount > 0
              ? "Semua stok sudah ada"
              : uploadedCount > 0
                ? `${uploadedCount} stok berhasil disimpan`
                : undefined
          }
        />
      ) : null}
      {query.error ? (
        <AdminResultModal
          message={uploadErrorMessages[query.error] ?? "Stok gagal diproses. Muat ulang halaman dan coba kembali."}
          tone="error"
        />
      ) : null}

      <section className="metric-grid warehouse-metrics">
        <article className="metric-card accent-orange">
          <div className="metric-card-title">
            <span>Total file</span>
            <Boxes aria-hidden="true" />
          </div>
          <strong>{product._count.stockItems}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title">
            <span>Siap dijual</span>
            <PackageOpen aria-hidden="true" />
          </div>
          <strong>{ready}</strong>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title">
            <span>Reserved</span>
            <LockKeyhole aria-hidden="true" />
          </div>
          <strong>{reserved}</strong>
        </article>
        <article className="metric-card accent-ink">
          <div className="metric-card-title">
            <span>Terjual</span>
            <BadgeCheck aria-hidden="true" />
          </div>
          <strong>{sold}</strong>
        </article>
        <article className="metric-card accent-red">
          <div className="metric-card-title">
            <span>Banned</span>
            <ShieldBan aria-hidden="true" />
          </div>
          <strong>{banned}</strong>
        </article>
      </section>

      <section className="panel panel-dark product-stock-intake">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon">
              <UploadCloud aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Inventory intake</p>
              <h2>Upload stok {product.name}</h2>
            </div>
          </div>
        </div>
        <StockUploadForm product={{ id: product.id, name: product.name }} returnTo={actionReturnTo} />
      </section>

      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search warehouse</p><h2>Cari file produk</h2></div>
        </div>
        <InventoryFilterForm
          action={`/admin/products/${product.id}/stock#inventory-ledger`}
          dateLabel="Tanggal upload"
          filters={filters}
          lifecycleOptions={[
            { value: "AVAILABLE", label: "Tersedia" },
            { value: "RESERVED", label: "Direservasi" },
            { value: "DELIVERED", label: "Terkirim" },
            { value: "BANNED", label: "Banned" },
            { value: "DISABLED", label: "Disabled" },
          ]}
          showProduct={false}
        />
        <InventoryTable
          items={items}
          pagination={{
            basePath: `/admin/products/${product.id}/stock`,
            currentPage: pagination.page,
            pageSize: pagination.pageSize,
            query: inventoryFilterQuery(filters),
            totalItems: pagination.totalItems,
          }}
          returnTo={returnTo}
        />
      </section>
    </AdminShell>
  );
}
