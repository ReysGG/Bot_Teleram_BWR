import Link from "next/link";
import { requireSellerPage } from "@/server/seller/access";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { getSellerProducts } from "@/server/seller/portal";
export default async function SellerProductsPage() {
  const seller=await requireSellerPage();
  const { drafts, products } = await getSellerProducts(seller.id);
  return <section className="seller-panel"><div className="seller-panel-heading"><div><p className="seller-eyebrow">KATALOG MILIKMU</p><h1>Produk saya</h1></div><Link className="seller-button" href="/seller/products/new">Buat draft</Link></div>
    {products.length ? <section className="seller-table-panel"><h2>Produk terbit</h2><div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Nama</th><th>Harga</th><th>Status</th><th>Order item</th><th>Diperbarui</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td><strong>{p.name}</strong>{p.variantLabel ? <small>{p.variantLabel}</small> : null}</td><td>Rp {p.price.toLocaleString("id-ID")}</td><td><span className="seller-status">{p.status}</span></td><td>{p._count.orderItems}</td><td>{p.updatedAt.toLocaleDateString("id-ID")}</td></tr>)}</tbody></table></div></section> : null}
    {drafts.length ? <section className="seller-draft-list"><h2>Draft & review</h2>{drafts.map(d=><article key={d.id} className="seller-notice"><h3>{d.name}</h3><p>Rp {d.price.toLocaleString("id-ID")} · <span className="seller-status">{d.status}</span></p><p>{d.description}</p>{d.reviewReason?<p className="seller-warning">Catatan admin: {d.reviewReason}</p>:null}{d.status==="DRAFT"?<form action={`/api/seller/drafts/${d.id}/submit`} method="post"><input type="hidden" name="revision" value={d.revision}/><AdminConfirmSubmitButton title="Kirim draft untuk review?" description="Admin akan meninjau produk sebelum publikasi." confirmText="Kirim untuk review" className="seller-button">Ajukan review</AdminConfirmSubmitButton></form>:null}</article>)}</section>:<div className="seller-empty"><strong>Belum ada produk seller</strong><p>Buat draft produk pertama. Admin akan meninjau sebelum produk tayang.</p></div>}
  </section>;
}
