import { requireSellerPage } from "@/server/seller/access";
import { SellerDraftForm } from "@/components/seller/draft-form";
export default async function NewSellerProductPage() {
  await requireSellerPage();
  return <section className="seller-panel"><p className="seller-eyebrow">DRAFT PRODUK</p><h1>Buat produk</h1><p>Draft tersimpan privat sampai dikirim untuk review admin.</p><SellerDraftForm/></section>;
}
