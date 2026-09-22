import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSellerPage } from "@/server/seller/access";
import { getSellerDraft } from "@/server/seller/portal";
import { SellerDraftForm } from "@/components/seller/draft-form";

export const dynamic = "force-dynamic";

export default async function EditSellerProductPage({ params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSellerPage();
  const { id } = await params;
  const draft = await getSellerDraft(seller.id, id);
  if (!draft) notFound();
  if (!["DRAFT", "REJECTED"].includes(draft.status)) return <section className="seller-panel"><Link className="seller-back-link" href="/seller/products">← Produk saya</Link><h1>Draft sedang direview</h1><p>Draft dengan status {draft.status} tidak dapat diubah sampai keputusan review selesai.</p></section>;
  return <section className="seller-panel"><Link className="seller-back-link" href="/seller/products">← Produk saya</Link><p className="seller-eyebrow">REVISI DRAFT</p><h1>Edit produk</h1><p>Perubahan membuat revisi baru dan mengembalikan draft ke status privat.</p><SellerDraftForm draft={draft} /></section>;
}
