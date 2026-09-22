import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryFilterForm } from "@/components/admin/inventory-filter-form";
import { Prisma } from "@/generated/prisma/client";
import { InventoryTable } from "@/components/admin/inventory-table";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
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

export default async function SoldInventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventoryFilterParams & { notice?: string; error?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const filters = { ...parseInventoryFilters(params), lifecycle: "" as const };
  const search = normalizeAdminSearch(filters.search);
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      { archivedAt: null, status: "DELIVERED" },
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "deliveredAt"),
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
    orderBy: inventoryOrderBy(filters, "deliveredAt"),
    skip: pagination.skip,
    take: pagination.take,
  });
  const items = records.map((item) => ({
    ...item,
    invoiceNumber: item.orderItem?.order.invoiceNumber,
  }));
  const notice =
    params.notice === "archived"
      ? "Riwayat stok terjual berhasil diarsipkan."
      : params.notice
        ? "Pemeriksaan akun terjual selesai."
        : null;
  const downloadError = stockDownloadErrorMessage(params.error);

  return (
    <AdminShell
      active="sold"
      counts={counts}
      description="Seluruh file yang pernah terkirim. Penjualan tidak otomatis masuk Arsip; admin dapat mengarsipkannya manual bila diperlukan."
      email={admin.email}
      eyebrow="Delivery archive"
      title="Terjual"
    >
      {notice ? <p className="alert alert-success">{notice}</p> : null}
      {params.error ? <p className="alert alert-error">{downloadError ?? "Pemeriksaan akun terjual gagal."}</p> : null}
      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search inventory</p><h2>Cari file terjual</h2></div>
        </div>
        <InventoryFilterForm action="/admin/inventory/sold#inventory-ledger" dateLabel="Tanggal terkirim" filters={filters} products={products} />
        <InventoryTable
          items={items}
          pagination={{
            basePath: "/admin/inventory/sold",
            currentPage: pagination.page,
            pageSize: pagination.pageSize,
            query: inventoryFilterQuery(filters),
            totalItems: pagination.totalItems,
          }}
          returnTo="/admin/inventory/sold"
        />
      </section>
    </AdminShell>
  );
}
