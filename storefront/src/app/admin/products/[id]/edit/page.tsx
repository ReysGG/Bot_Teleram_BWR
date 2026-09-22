import Link from "next/link";
import { ArrowLeft, PackageSearch, Pencil, RefreshCw } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { AdminShell } from "@/components/admin/admin-shell";
import { ProductEditForm } from "@/components/admin/product-edit-form";
import { ProductDeleteForm } from "@/components/admin/product-delete-form";
import { ProductStatusAction } from "@/components/admin/product-status-action";

import { BannedStockPolicyForm } from "@/components/admin/banned-stock-policy-form";
import { getAdminInventoryCounts, stockUploadNotice, type StockUploadNoticeParams } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import { PRODUCT_FORM_ERROR_MESSAGES } from "@/lib/admin-product-form-errors";
import { STOCK_UPLOAD_ERROR_MESSAGES } from "@/lib/admin-stock-upload-errors";

export const dynamic = "force-dynamic";

const uploadErrors: Record<string, string> = {
  ...PRODUCT_FORM_ERROR_MESSAGES,
  ...STOCK_UPLOAD_ERROR_MESSAGES,
  "product-status": "Status produk gagal diperbarui.",
};

export default async function ProductEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<StockUploadNoticeParams & { error?: string; notice?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [counts, product, productGroups] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.product.findUnique({
      where: { id },
      include: { _count: { select: { stockItems: true, orderItems: true } } },
    }),
    prisma.productGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, status: true },
    }),
  ]);
  if (!product) notFound();
  const uploadNotice = stockUploadNotice(query);
  const allocated = Number.parseInt(query.allocated ?? "0", 10) || 0;
  const checkNotice = query.notice?.startsWith("checked-")
    ? (() => {
        const [, checked, healthy, banned, errors] = query.notice.split("-");
        return `Checker selesai: ${checked} diperiksa, ${healthy} sehat, ${banned} banned, ${errors} error.${
          allocated > 0 ? ` ${allocated} preorder langsung dialokasikan.` : ""
        }`;
      })()
    : null;
  const notice = query.notice === "product-created"
    ? "Produk berhasil dibuat. Selanjutnya, buka gudang untuk memasukkan stok."
    : query.notice === "product-edited"
    ? "Detail produk berhasil diperbarui."
    : query.notice === "product-activated"
      ? "Produk berhasil diaktifkan kembali."
      : query.notice === "product-deactivated"
        ? "Produk berhasil dinonaktifkan."
    : query.notice === "banned-policy-updated"
      ? `Aturan stok banned berhasil diperbarui.${allocated > 0 ? ` ${allocated} preorder langsung dialokasikan.` : ""}`
    : checkNotice ?? uploadNotice;

  return (
    <AdminShell
      active="products"
      counts={counts}
      description={`Atur informasi katalog, harga, dan panduan pembeli untuk ${product.name}.`}
      email={admin.email}
      eyebrow="Product workspace"
      headerVariant="compact"
      title={product.name}
    >
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href={product.status === "ACTIVE" ? "/admin/products" : "/admin/products/inactive"} prefetch={false}>
          <ArrowLeft aria-hidden="true" size={17} /> Kembali ke {product.status === "ACTIVE" ? "produk aktif" : "produk nonaktif"}
        </Link>
        <ProductStatusAction
          compact={false}
          failureReturnTo={`/admin/products/${product.id}/edit`}
          id={product.id}
          name={product.name}
          returnTo={product.status === "ACTIVE" ? "/admin/products/inactive#product-list" : "/admin/products#product-list"}
          status={product.status}
        />
      </div>

      {notice ? <AdminResultModal message={notice} tone="success" /> : null}
      {query.error ? (
        <AdminResultModal message={query.error === "banned-policy" ? "Aturan stok banned gagal diperbarui." : uploadErrors[query.error] ?? "Operasi produk gagal."} tone="error" />
      ) : null}

      <section className="panel product-details-panel">
          <div className="panel-heading">
            <div className="panel-heading-title">
              <span className="panel-heading-icon"><Pencil aria-hidden="true" /></span>
              <div><p className="eyebrow">Product detail</p><h2>Edit produk</h2></div>
            </div>
          </div>
          <ProductEditForm groups={productGroups} product={product} />
      </section>

      <section className="panel product-stock-shortcut">
        <div><h2>Stok produk</h2><p>{product._count.stockItems} file tersimpan. Upload dan pengelolaan stok tersedia di gudang produk.</p></div>
        <Link className="button button-light" href={`/admin/products/${product.id}/stock`} prefetch={false}><PackageSearch aria-hidden="true" size={17} /> Buka gudang & upload stok</Link>
      </section>
      <BannedStockPolicyForm compact product={product} />
      <section className="panel product-danger-zone">
        <div>
          <p className="eyebrow">Operasional produk</p>
          <h2>Check dan penghapusan</h2>
          <p className="muted">
            Pemeriksaan stok berjalan untuk produk ini saja. Penghapusan dikunci jika produk sudah memiliki stok atau riwayat order.
          </p>
        </div>
        <div className="product-row-actions">
          <form action="/api/admin/inventory/check" method="post">
            <input name="productId" type="hidden" value={product.id} />
            <input name="returnTo" type="hidden" value={`/admin/products/${product.id}/edit`} />
            <button className="button" type="submit">
              <RefreshCw aria-hidden="true" size={17} /> Check stok sekarang
            </button>
          </form>
          <ProductDeleteForm
            id={product.id}
            hasOrderHistory={product._count.orderItems > 0}
            name={product.name}
            returnTo={product.status === "ACTIVE" ? "/admin/products#product-list" : "/admin/products/inactive#product-list"}
            status={product.status}
            stockCount={product._count.stockItems}
            hideDeactivate
          />
        </div>
      </section>
    </AdminShell>
  );
}
