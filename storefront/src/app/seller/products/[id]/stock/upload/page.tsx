import Link from "next/link";
import { notFound } from "next/navigation";
import { StockUploadForm } from "@/components/admin/stock-upload-form";
import { requireSellerPage } from "@/server/seller/access";
import { prisma } from "@/server/db/prisma";
export default async function SellerProductStockUploadPage({ params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSellerPage();
  const { id } = await params;
  const product = await prisma.product.findFirst({ where: { id, sellerId: seller.id }, select: { id: true, name: true } });
  if (!product) notFound();
  return <section className="seller-panel"><Link className="seller-back-link" href={`/seller/products/${product.id}/stock`}>← Kembali ke gudang</Link><p className="seller-eyebrow">INVENTORY INTAKE</p><h1>Upload stok</h1><p className="seller-muted">Semua file masuk hanya ke produk {product.name}, dienkripsi, diperiksa duplikat, lalu dicek health-nya.</p><div className="seller-upload-card"><StockUploadForm action={`/api/seller/products/${product.id}/stock`} allowedRedirectPrefixes={["/seller"]} product={product} returnTo={`/seller/products/${product.id}/stock`} /></div></section>;
}
