import Link from "next/link";
import { requireSellerPage } from "@/server/seller/access";
import { prisma } from "@/server/db/prisma";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
export default async function SellerProductsPage() {
  const seller=await requireSellerPage();
  const drafts=await prisma.sellerProductDraft.findMany({where:{sellerId:seller.id},orderBy:{updatedAt:"desc"},take:50});
  return <section className="seller-panel"><div className="seller-panel-heading"><div><p className="seller-eyebrow">KATALOG MILIKMU</p><h1>Produk saya</h1></div><Link className="seller-button" href="/seller/products/new">Buat draft</Link></div>
    {drafts.length ? drafts.map(d=><article key={d.id} className="seller-notice"><h2>{d.name}</h2><p>{d.price.toLocaleString("id-ID")} rupiah · {d.status}</p><p>{d.description}</p>{d.reviewReason?<p>Catatan admin: {d.reviewReason}</p>:null}{d.status==="DRAFT"?<form action={`/api/seller/drafts/${d.id}/submit`} method="post"><input type="hidden" name="revision" value={d.revision}/><AdminConfirmSubmitButton title="Kirim draft untuk review?" description="Admin akan meninjau produk sebelum publikasi." confirmText="Kirim untuk review" className="seller-button">Ajukan review</AdminConfirmSubmitButton></form>:null}</article>):<div className="seller-empty"><strong>Belum ada produk seller</strong><p>Buat draft produk pertama. Admin akan meninjau sebelum produk tayang.</p></div>}
  </section>;
}
