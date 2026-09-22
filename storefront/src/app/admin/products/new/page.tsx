import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { productFormErrorMessage } from "@/lib/admin-product-form-errors";
import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { requireAdminPage } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";
import { getAdminInventoryCounts } from "@/server/admin/inventory";

export const dynamic = "force-dynamic";
export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ groupId?: string; error?: string }> }) {
  const admin = await requireAdminPage();
  const [query, counts, groups] = await Promise.all([
    searchParams, getAdminInventoryCounts(),
    prisma.productGroup.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, status: true } }),
  ]);
  const group = groups.find(item => item.id === query.groupId);
  const back = group ? `/admin/product-groups/${group.id}/edit` : "/admin/products";
  return <AdminShell active="products" counts={counts} email={admin.email} headerVariant="compact" eyebrow="Katalog produk"
    title={group ? `Tambah varian ${group.name}` : "Tambah produk"} description="Buat detail produk terlebih dahulu, kemudian masukkan stoknya.">
    <div className="inventory-edit-toolbar"><Link className="button button-ghost" href={back} prefetch={false}>Kembali ke {group ? "grup" : "produk"}</Link></div>
    {query.error ? <AdminResultModal message={productFormErrorMessage(query.error)} tone="error" /> : null}
    <section className="panel product-details-panel">
      <ProductEditForm groups={groups} defaultGroupId={group?.id} returnTo={group ? back : "/admin/products/new"} />
    </section>
  </AdminShell>;
}
