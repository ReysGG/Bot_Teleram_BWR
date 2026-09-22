import Link from "next/link";
import { requireSellerPage } from "@/server/seller/access";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { getSellerProducts } from "@/server/seller/portal";
import { SellerEmpty } from "@/components/seller/seller-primitives";

export const dynamic = "force-dynamic";

export default async function SellerProductsPage() {
  const seller = await requireSellerPage();
  const { drafts, products } = await getSellerProducts(seller.id);
  return <section className="seller-panel"><div className="seller-panel-heading"><div><p className="seller-eyebrow">KATALOG MILIKMU</p><h1>Produk saya</h1></div><Link className="seller-button" href="/seller/products/new">Buat draft</Link></div>
    {products.length ? <section className="seller-table-panel"><h2>Produk terbit</h2><div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Nama</th><th>Harga</th><th>Status</th><th>Order item</th><th>Diperbarui</th><th>Aksi</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><strong>{product.name}</strong>{product.variantLabel ? <small>{product.variantLabel}</small> : null}</td><td>Rp {product.price.toLocaleString("id-ID")}</td><td><span className="seller-status">{product.status}</span></td><td>{product._count.orderItems}</td><td>{product.updatedAt.toLocaleDateString("id-ID")}</td><td><Link className="seller-back-link" href={`/seller/products/${product.id}/stock`}>Kelola stok</Link></td></tr>)}</tbody></table></div></section> : null}
    {drafts.length ? <section className="seller-draft-list"><h2>Draft & review</h2>{drafts.map(draft => <article key={draft.id} className="seller-notice"><h3>{draft.name}</h3><p>Rp {draft.price.toLocaleString("id-ID")} - <span className="seller-status">{draft.status}</span></p><p>{draft.description}</p>{draft.reviewReason ? <p className="seller-warning">Catatan admin: {draft.reviewReason}</p> : null}<div className="seller-admin-actions">{["DRAFT", "REJECTED"].includes(draft.status) ? <Link className="seller-button" href={`/seller/products/${draft.id}/edit`}>Edit draft</Link> : null}{draft.status === "DRAFT" ? <form action={`/api/seller/drafts/${draft.id}/submit`} method="post"><input type="hidden" name="revision" value={draft.revision} /><AdminConfirmSubmitButton title="Kirim draft untuk review?" description="Admin akan meninjau produk sebelum publikasi." confirmText="Kirim untuk review" className="seller-button">Ajukan review</AdminConfirmSubmitButton></form> : null}</div></article>)}</section> : <SellerEmpty title="Belum ada produk seller" description="Buat draft produk pertama. Admin akan meninjau sebelum produk tayang." action={<Link className="seller-button" href="/seller/products/new">Buat draft produk</Link>} />}
  </section>;
}
