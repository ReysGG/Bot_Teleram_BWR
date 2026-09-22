import { AdminShell } from "@/components/admin/admin-shell";
import { InventoryContentSearch } from "@/components/admin/inventory-content-search";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";
export default async function InventorySearchPage() {
  const admin = await requireAdminPage();
  const [counts, products] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return <AdminShell active="contentSearch" email={admin.email} counts={counts} eyebrow="Pencarian stok" title="Cari isi stok & pembeli" description="Cari kode CDK, email, atau potongan isi file untuk menemukan stok dan pembeli yang terkait. Semua status stok, termasuk terjual dan arsip, ikut diperiksa.">
    <InventoryContentSearch products={products} />
  </AdminShell>;
}
