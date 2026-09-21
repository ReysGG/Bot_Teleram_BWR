import Link from "next/link";
import { ArrowLeft, Layers3 } from "lucide-react";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductGroupForm } from "@/components/admin/product-group-form";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";

export default async function NewProductGroupPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [admin, counts, query] = await Promise.all([requireAdminPage(), getAdminInventoryCounts(), searchParams]);
  return (
    <AdminShell active="productGroups" counts={counts} description="Buat parent katalog baru. Harga dan stok tetap dimiliki oleh setiap varian." email={admin.email} eyebrow="New catalog group" title="Tambah grup produk">
      <Link className="button button-ghost" href="/admin/product-groups" prefetch={false}><ArrowLeft aria-hidden="true" size={17} /> Kembali</Link>
      {query.error ? <AdminResultModal message={query.error === "group-description"
        ? "Format deskripsi grup Indonesia atau English tidak valid. Periksa panjang teks, link HTTPS, dan formatnya."
        : "Data grup tidak valid atau nama grup sudah digunakan."} tone="error" /> : null}
      <section className="panel wide-panel product-group-editor-panel">
        <div className="panel-heading"><div className="panel-heading-title"><span className="panel-heading-icon"><Layers3 aria-hidden="true" /></span><div><p className="eyebrow">Parent product</p><h2>Detail grup</h2></div></div></div>
        <ProductGroupForm />
      </section>
    </AdminShell>
  );
}
