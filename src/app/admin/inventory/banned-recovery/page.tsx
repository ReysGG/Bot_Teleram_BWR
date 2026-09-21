import { KeyRound, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { BannedRecoveryTable } from "@/components/admin/banned-recovery-table";
import { InventoryFilterForm } from "@/components/admin/inventory-filter-form";
import { MetricCard } from "@/components/admin/metric-card";
import { Prisma } from "@/generated/prisma/client";
import { inventorySearchWhere } from "@/server/admin/catalog-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { normalizeAdminSearch } from "@/server/admin/order-search";
import {
  inventoryFilterQuery,
  inventoryFilterWhere,
  inventoryOrderBy,
  parseInventoryFilters,
  type InventoryFilterParams,
} from "@/server/admin/inventory-query";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function BannedRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<InventoryFilterParams & { policy?: string; page?: string; notice?: string; error?: string; allocated?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const filters = { ...parseInventoryFilters(query), health: "" as const };
  const search = normalizeAdminSearch(filters.search);
  const productId = filters.productId;
  const policy = query.policy === "ALLOW_HTTP_401" || query.policy === "OWNER_APPROVAL" || query.policy === "RELOGIN_REQUIRED" || query.policy === "BLOCKED" ? query.policy : "";
  const where: Prisma.DigitalStockItemWhereInput = {
    AND: [
      { archivedAt: null, healthStatus: "BANNED" },
      productId ? { productId } : {},
      policy ? { product: { bannedStockPolicy: policy } } : {},
      inventorySearchWhere(search),
      inventoryFilterWhere(filters, "lastCheckedAt"),
    ],
  };
  const [counts, products, totalItems, approvedCount, reloginCount, protectedCount] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findMany({ where: { stockItems: { some: { archivedAt: null, healthStatus: "BANNED" } } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.digitalStockItem.count({ where }),
    prisma.digitalStockItem.count({ where: { archivedAt: null, healthStatus: "BANNED", bannedSaleApprovedAt: { not: null } } }),
    prisma.digitalStockItem.count({ where: { archivedAt: null, healthStatus: "BANNED", product: { bannedStockPolicy: "RELOGIN_REQUIRED" }, deliveredOrderId: null } }),
    prisma.digitalStockItem.count({ where: { archivedAt: null, healthStatus: "BANNED", deliveredOrderId: { not: null } } }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const items = await prisma.digitalStockItem.findMany({
    where,
    include: {
      product: { select: { id: true, name: true, bannedStockPolicy: true } },
      orderItem: { include: { order: { select: { invoiceNumber: true } } } },
      deliveryReceipt: { select: { id: true } },
    },
    orderBy: inventoryOrderBy(filters, "lastCheckedAt"),
    skip: pagination.skip,
    take: pagination.take,
  });
  const allocated = Number.parseInt(query.allocated ?? "0", 10) || 0;

  return (
    <AdminShell active="bannedRecovery" counts={counts} description="Pisahkan akun yang wajib relogin, diblokir, dijual otomatis khusus HTTP 401, atau dijual setelah owner menyetujui stok tertentu. Riwayat delivered selalu dilindungi." email={admin.email} eyebrow="Banned stock control" title="Recovery stok banned">
      {query.notice === "banned-sale-approved" ? <p className="alert alert-success">Izin jual owner disimpan.{allocated > 0 ? ` ${allocated} preorder langsung dialokasikan.` : ""}</p> : null}
      {query.notice === "banned-sale-revoked" ? <p className="alert alert-success">Izin jual dicabut dan stok kembali diblokir.</p> : null}
      {query.error ? <p className="alert alert-error">Perubahan izin gagal. Pastikan stok belum pernah dikirim atau direservasi dan policy produk mengizinkan.</p> : null}
      <p className="alert alert-error">HTTP 401 Codex Free dengan policy Relogin wajib tidak dapat disetujui untuk dijual. Edit credential dan jalankan health check sampai sehat.</p>
      <section className="metric-grid">
        <MetricCard accent="accent-orange" icon={<Search aria-hidden="true" />} label="Hasil filter" value={totalItems} />
        <MetricCard accent="accent-green" icon={<ShieldCheck aria-hidden="true" />} label="Disetujui owner" value={approvedCount} />
        <MetricCard accent="accent-yellow" icon={<KeyRound aria-hidden="true" />} label="Menunggu relogin" value={reloginCount} />
        <MetricCard accent="accent-ink" icon={<ShieldAlert aria-hidden="true" />} label="Riwayat terlindungi" value={protectedCount} />
      </section>
      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Recovery ledger</p><h2>Stok banned per produk</h2></div>
        </div>
        <InventoryFilterForm
          action="/admin/inventory/banned-recovery#inventory-ledger"
          dateLabel="Tanggal check"
          extraFilterActive={Boolean(policy)}
          extraFilters={(
            <label>
              <span>Policy</span>
              <select defaultValue={policy} name="policy">
                <option value="">Semua policy</option>
                <option value="ALLOW_HTTP_401">HTTP 401 otomatis</option>
                <option value="OWNER_APPROVAL">Izin owner</option>
                <option value="RELOGIN_REQUIRED">Relogin wajib</option>
                <option value="BLOCKED">Diblokir</option>
              </select>
            </label>
          )}
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
        <BannedRecoveryTable items={items} pagination={{ currentPage: pagination.page, pageSize: pagination.pageSize, query: { ...inventoryFilterQuery(filters), policy: policy || undefined }, totalItems: pagination.totalItems }} />
      </section>
    </AdminShell>
  );
}
