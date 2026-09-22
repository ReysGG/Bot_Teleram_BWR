import Link from "next/link";
import { ArrowLeft, Layers3, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductGroupDeleteForm } from "@/components/admin/product-group-delete-form";
import { ProductGroupForm } from "@/components/admin/product-group-form";

import { AdminStatusPill, AdminTable } from "@/components/admin/admin-ui";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";

export const dynamic = "force-dynamic";

export default async function EditProductGroupPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  const [{ id }, query, admin, counts] = await Promise.all([params, searchParams, requireAdminPage(), getAdminInventoryCounts()]);
  const group = await prisma.productGroup.findUnique({
    where: { id },
    include: {
      products: { orderBy: [{ groupSortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, variantLabel: true, price: true, status: true, groupSortOrder: true } },
      _count: { select: { products: true } },
    },
  });
  if (!group) notFound();
  return (
    <AdminShell active="productGroups" counts={counts} description="Edit parent katalog dan buka setiap produk untuk mengatur harga, stok, serta label variannya." email={admin.email} eyebrow="Catalog group workspace" title={group.name}>
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href="/admin/product-groups" prefetch={false}><ArrowLeft aria-hidden="true" size={17} /> Kembali ke grup</Link>
        <div className="product-row-actions">
          <Link className="button button-primary" href={`/admin/products/new?groupId=${encodeURIComponent(group.id)}`} prefetch={false}>Tambah varian</Link>
          <Link className="button" href="/admin/products" prefetch={false}>Kelola semua produk</Link>
        </div>
      </div>
      {query.notice === "group-edited" ? <AdminResultModal message="Grup produk berhasil diperbarui." tone="success" /> : null}
      {query.notice === "variant-created" ? <AdminResultModal message="Varian baru berhasil dibuat dan dimasukkan ke grup ini." tone="success" /> : null}
      {query.error ? <AdminResultModal message={query.error === "product"
        ? "Varian gagal dibuat. Periksa harga, label varian, dan detail produk."
        : query.error === "product-image"
          ? "Gambar varian gagal diproses. Gunakan PNG, JPG, WebP, atau GIF maksimal 3 MB."
          : query.error === "product-attachment"
            ? "Panduan/lampiran varian gagal diproses. Ukuran maksimal 8 MB."
          : query.error === "product-post-delivery"
            ? "Instruksi setelah pengiriman tidak valid. Gunakan URL HTTPS dan instruksi maksimal 3.200 karakter."
          : query.error === "product-description"
            ? "Format deskripsi varian Indonesia atau English tidak valid. Periksa panjang teks, link HTTPS, dan formatnya."
          : query.error === "group-description"
            ? "Format deskripsi grup Indonesia atau English tidak valid. Periksa panjang teks, link HTTPS, dan formatnya."
            : "Perubahan grup gagal disimpan. Periksa kembali semua kolom."} tone="error" /> : null}
      <div className="product-group-workspace">
        <section className="panel product-group-editor-panel">
          <div className="panel-heading"><div className="panel-heading-title"><span className="panel-heading-icon"><Pencil aria-hidden="true" /></span><div><p className="eyebrow">Parent detail</p><h2>Edit grup</h2><p className="muted">Preview Telegram langsung mengikuti perubahan deskripsi.</p></div></div></div>
          <ProductGroupForm group={group} />
        </section>
        <aside className="panel product-group-variants-panel">
          <div className="panel-heading"><div className="panel-heading-title"><span className="panel-heading-icon"><Layers3 aria-hidden="true" /></span><div><p className="eyebrow">Child products</p><h2>{group._count.products} varian</h2><p className="muted">Daftar ini memiliki scroll sendiri agar form grup tetap mudah dijangkau.</p></div></div></div>
          <div className="product-group-variant-scroll">
            <AdminTable>
              <thead><tr><th>Varian</th><th>Harga</th><th>Urutan</th><th>Status</th><th>Aksi</th></tr></thead>
              <tbody>
                {group.products.map((product) => (
                  <tr key={product.id}>
                    <td><strong>{product.variantLabel ?? product.name}</strong><small>{product.name}</small></td>
                    <td>{formatRupiah(product.price)}</td>
                    <td>{product.groupSortOrder}</td>
                    <td><AdminStatusPill tone={product.status === "ACTIVE" ? "good" : "neutral"}>{product.status}</AdminStatusPill></td>
                    <td><Link className="button button-small" href={`/admin/products/${product.id}/edit`} prefetch={false}><Pencil aria-hidden="true" size={15} /> Edit</Link></td>
                  </tr>
                ))}
              </tbody>
            </AdminTable>
            {group.products.length === 0 ? <p className="muted product-group-empty">Belum ada produk di dalam grup ini. Gunakan tombol Tambah varian.</p> : null}
          </div>
        </aside>
      </div>
      <section className="panel product-danger-zone">
        <div><p className="eyebrow">Danger zone</p><h2>Hapus grup</h2><p className="muted">Grup hanya dapat dihapus jika tidak memiliki varian. Menonaktifkan grup tidak menghapus produk atau riwayat order.</p></div>
        <ProductGroupDeleteForm id={group.id} name={group.name} productCount={group._count.products} />
      </section>
    </AdminShell>
  );
}
