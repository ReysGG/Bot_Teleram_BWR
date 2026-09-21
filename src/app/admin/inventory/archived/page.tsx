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

const noticeMessages: Record<string, string> = {
  archived: "Stok berhasil diarsipkan.",
  restored: "Stok berhasil dipulihkan ke lifecycle aktifnya.",
  deleted: "Stok dan credential terenkripsinya berhasil dihapus permanen.",
  "stock-edited": "Stok archived berhasil diperbarui dan dienkripsi ulang.",
};

export default async function ArchivedInventoryPage({
  searchParams,
}: {
  searchParams: Promise<InventoryFilterParams & { notice?: string; error?: string; page?: string }>;
}) {
  const admin = await requireAdminPage();
  const params = await searchParams;
  const filters = parseInventoryFilters(params);
  const search = normalizeAdminSearch(filters.search);
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      { archivedAt: { not: null } },
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "archivedAt"),
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
    orderBy: inventoryOrderBy(filters, "archivedAt"),
    skip: pagination.skip,
    take: pagination.take,
  });
  const items = records.map((item) => ({
    ...item,
    invoiceNumber:
      item.status === "DELIVERED" ? item.orderItem?.order.invoiceNumber : null,
  }));
  const downloadError = stockDownloadErrorMessage(params.error);

  return (
    <AdminShell
      active="archived"
      counts={counts}
      description="Hanya stok yang sengaja diarsipkan admin. Stok belum terjual dapat dipulihkan atau dihapus permanen; riwayat terjual tetap dilindungi."
      email={admin.email}
      eyebrow="Retention vault"
      title="Arsip"
    >
      {params.notice ? (
        <p className="alert alert-success">
          {noticeMessages[params.notice] ?? "Operasi stok selesai."}
        </p>
      ) : null}
      {params.error ? (
        <p className="alert alert-error">
          {downloadError ?? "Stok tidak dapat diproses karena sedang terkunci atau memiliki referensi order."}
        </p>
      ) : null}
      <section className="panel inventory-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Search inventory</p><h2>Cari file arsip</h2></div>
        </div>
        <InventoryFilterForm
          action="/admin/inventory/archived#inventory-ledger"
          dateLabel="Tanggal arsip"
          filters={filters}
          lifecycleOptions={[
            { value: "AVAILABLE", label: "Tersedia" },
            { value: "RESERVED", label: "Direservasi" },
            { value: "DELIVERED", label: "Terkirim" },
            { value: "BANNED", label: "Banned" },
            { value: "DISABLED", label: "Disabled" },
          ]}
          products={products}
        />
        <InventoryTable
          items={items}
          pagination={{
            basePath: "/admin/inventory/archived",
            currentPage: pagination.page,
            pageSize: pagination.pageSize,
            query: inventoryFilterQuery(filters),
            totalItems: pagination.totalItems,
          }}
          returnTo="/admin/inventory/archived"
        />
      </section>
    </AdminShell>
  );
}
