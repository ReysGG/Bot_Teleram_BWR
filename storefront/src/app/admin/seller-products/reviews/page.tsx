import { requireAdminPage } from "@/server/security/admin-auth";
import { prisma } from "@/server/db/prisma";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import Link from "next/link";
export default async function SellerReviewsPage(){
  await requireAdminPage();
  const drafts=await prisma.sellerProductDraft.findMany({where:{status:"SUBMITTED"},include:{seller:{select:{displayName:true}}},orderBy:{createdAt:"asc"},take:50});
  return <main className="admin-content"><Link href="/admin">Kembali ke dashboard</Link><h1>Review produk seller</h1><p>Produk approved tetap nonaktif selama pengujian lokal settlement belum selesai.</p>{drafts.length?drafts.map(d=><section className="panel" key={d.id}><h2>{d.name}</h2><p>{d.seller.displayName} · Rp {d.price.toLocaleString("id-ID")}</p><p>{d.description}</p><form method="post" action={`/api/admin/seller-products/${d.id}/review`}><input name="revision" value={d.revision} type="hidden"/><label>Keputusan<select name="decision"><option value="approve">Setujui draft</option><option value="reject">Tolak draft</option></select></label><label>Alasan penolakan<textarea name="reason" maxLength={1000}/></label><AdminConfirmSubmitButton title="Simpan hasil review?" description="Keputusan ini dicatat bersama identitas admin dan versi draft." confirmText="Simpan keputusan">Simpan review</AdminConfirmSubmitButton></form></section>):<p>Belum ada draft menunggu review.</p>}</main>;
}
