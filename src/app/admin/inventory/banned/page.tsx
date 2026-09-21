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
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { stockDownloadErrorMessage } from "@/lib/admin-stock-download-errors";

export const dynamic = "force-dynamic";

export default async function BannedInventoryPage({
  searchParams,
}: {
  searchParams: Promise<StockUploadNoticeParams & InventoryFilterParams & { error?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const filters = { ...parseInventoryFilters(params), health: "" as const };
  const search = normalizeAdminSearch(filters.search);
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      {
        archivedAt: null,
        OR: [{ status: "BANNED" }, { healthStatus: "BANNED" }],
      },
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "lastCheckedAt"),
    ],
  };
  const [counts, products, totalItems] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.digitalStockItem.count({ where }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(params.page));
  const records = await prisma.digitalStockItem.findMany({
    where,
    include: {
      product: { select: { name: true } },
      orderItem: { include: { order: { select: { invoiceNumber: true } } } },
    },
    orderBy: inventoryOrderBy(filters, "lastCheckedAt"),
    skip: pagination.skip,
    take: pagination.take,
  });
  const items = records.map((item) => ({
    ...item,
    invoiceNumber:
      item.status === "DELIVERED" ? item.orderItem?.order.invoiceNumber : null,
  }));
  const uploadNotice = stockUploadNotice(params);
  const actionNotice =
    params.notice === "archived"
      ? "Stok banned berhasil diarsipkan."
      : params.notice === "deleted"
        ? "Stok banned berhasil dihapus permanen."
        : params.notice === "stock-edited-banned"
          ? "Stok berhasil diperbarui dan dienkripsi ulang, tetapi health check masih menghasilkan HTTP 401/402."
        : null;
  const downloadError = stockDownloadErrorMessage(params.error);

  return (
    <AdminShell
      active="banned"
      counts={counts}
      description="Semua akun dengan health status BANNED. Akun yang sudah terkirim tetap mempertahankan lifecycle DELIVERED."
      email={admin.email}
      eyebrow="Health exceptions"
      title="Banned"
    >
      {uploadNotice ? <p className="alert alert-success">{uploadNotice}</p> : null}
      {!uploadNotice && actionNotice ? (
        <p className="alert alert-success">{actionNotice}</p>
      ) : null}
      {!uploadNotice && !actionNotice && params.notice ? (
        <p className="alert alert-success">Pemeriksaan ulang selesai.</p>
      ) : null}
      {params.error ? <p className="alert alert-error">{downloadError ?? "Pemeriksaan ulang gagal."}</p> : null}
      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search inventory</p><h2>Cari file banned</h2></div>
        </div>
        <InventoryFilterForm
          action="/admin/inventory/banned#inventory-ledger"
          dateLabel="Tanggal check"
          filters={filters}
          lifecycleOptions={[
            { value: "AVAILABLE", label: "Tersedia" },
            { value: "RESERVED", label: "Direservasi" },
            { value: "DELIVERED", label: "Terkirim" },
            { value: "BANNED", label: "Lifecycle banned" },
            { value: "DISABLED", label: "Disabled" },
          ]}
          products={products}
          showHealth={false}
        />
        <InventoryTable
          items={items}
          pagination={{
            basePath: "/admin/inventory/banned",
            currentPage: pagination.page,
            pageSize: pagination.pageSize,
            query: inventoryFilterQuery(filters),
            totalItems: pagination.totalItems,
          }}
          returnTo="/admin/inventory/banned"
        />
      </section>
    </AdminShell>
  );
}
