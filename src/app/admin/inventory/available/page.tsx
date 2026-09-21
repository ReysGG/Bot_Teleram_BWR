import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryFilterForm } from "@/components/admin/inventory-filter-form";
import { Prisma } from "@/generated/prisma/client";
import { InventoryTable } from "@/components/admin/inventory-table";
import {
  getAdminInventoryCounts,
  stockUploadNotice,
  type StockUploadNoticeParams,
} from "@/server/admin/inventory";
import { inventorySearchWhere } from "@/server/admin/catalog-search";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import {
  inventoryFilterQuery,
  inventoryFilterWhere,
  inventoryOrderBy,
  parseInventoryFilters,
  type InventoryFilterParams,
} from "@/server/admin/inventory-query";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import {
  adminPagination,
  parseAdminPage,
} from "@/server/admin/pagination";
import { stockDownloadErrorMessage } from "@/lib/admin-stock-download-errors";

export const dynamic = "force-dynamic";

export default async function AvailableInventoryPage({
  searchParams,
}: {
  searchParams: Promise<StockUploadNoticeParams & InventoryFilterParams & { error?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const filters = parseInventoryFilters(params);
  const search = normalizeAdminSearch(filters.search);
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      { archivedAt: null, status: { in: ["AVAILABLE", "RESERVED"] } },
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "createdAt"),
    ],
  };
  const [counts, products, totalItems] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.digitalStockItem.count({ where }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(params.page));
  const items = await prisma.digitalStockItem.findMany({
    where,
    include: { product: { select: { name: true } } },
    orderBy: inventoryOrderBy(filters, "createdAt"),
    skip: pagination.skip,
    take: pagination.take,
  });
  const uploadNotice = stockUploadNotice(params);
  const allocated = Number.parseInt(params.allocated ?? "0", 10) || 0;
  const actionNotice =
    params.notice === "archived"
      ? "Stok berhasil diarsipkan."
      : params.notice === "deleted"
        ? "Stok berhasil dihapus permanen."
        : params.notice === "stock-edited-healthy"
          ? `Stok berhasil diperbarui, dienkripsi ulang, dan dinyatakan sehat.${
              allocated > 0 ? ` ${allocated} preorder langsung dialokasikan.` : ""
            }`
          : params.notice === "stock-edited-error"
            ? "Stok berhasil diperbarui, tetapi checker mengalami error. Jalankan Check akun lagi."
            : params.notice === "stock-edited-check-failed"
              ? "Stok berhasil diperbarui, tetapi proses check ulang belum selesai."
        : null;
  const downloadError = stockDownloadErrorMessage(params.error);

  return (
    <AdminShell
      active="available"
      counts={counts}
      description="Stok yang masih dapat dijual atau sedang dikunci checkout. Akun banned hanya muncul jika owner memberi izin jual eksplisit."
      email={admin.email}
      eyebrow="Inventory queue"
      title="Belum terjual"
    >
      {uploadNotice ? <p className="alert alert-success">{uploadNotice}</p> : null}
      {!uploadNotice && actionNotice ? (
        <p className="alert alert-success">{actionNotice}</p>
      ) : null}
      {!uploadNotice && !actionNotice && params.notice ? (
        <p className="alert alert-success">Pemeriksaan akun selesai.</p>
      ) : null}
      {params.error ? <p className="alert alert-error">{downloadError ?? "Pemeriksaan akun gagal."}</p> : null}
      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search inventory</p><h2>Cari file tersedia</h2></div>
        </div>
        <InventoryFilterForm
          action="/admin/inventory/available#inventory-ledger"
          dateLabel="Tanggal upload"
          filters={filters}
          lifecycleOptions={[
            { value: "AVAILABLE", label: "Tersedia" },
            { value: "RESERVED", label: "Direservasi" },
          ]}
          products={products}
        />
        <InventoryTable
          items={items}
          pagination={{
            basePath: "/admin/inventory/available",
            currentPage: pagination.page,
            pageSize: pagination.pageSize,
            query: inventoryFilterQuery(filters),
            totalItems: pagination.totalItems,
          }}
          returnTo="/admin/inventory/available"
        />
      </section>
    </AdminShell>
  );
}
