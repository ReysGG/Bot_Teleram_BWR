import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSellerPage } from "@/server/seller/access";
import { getSellerSale } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(value ?? 0))}`;
export const dynamic = "force-dynamic";

export default async function SellerSaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSellerPage();
  const { id } = await params;
  const sale = await getSellerSale(seller.id, id);
  if (!sale) notFound();
  return <section className="seller-panel"><Link className="seller-back-link" href="/seller/sales">← Penjualan</Link><p className="seller-eyebrow">DETAIL SETTLEMENT</p><h1>{sale.orderItem.productNameSnapshot}</h1><p className="seller-muted">Invoice {sale.orderItem.order.invoiceNumber}</p><dl className="seller-admin-list"><li><span>Status</span><strong className="seller-status">{sale.status}</strong></li><li><span>Gross</span><strong>{money(sale.gross)}</strong></li><li><span>Komisi</span><strong>{money(sale.commission)}</strong></li><li><span>Net seller</span><strong>{money(sale.net)}</strong></li><li><span>Unit</span><strong>{sale.orderItem.quantity}</strong></li><li><span>Eligible</span><strong>{sale.eligibleAt?.toLocaleString("id-ID") ?? "Menunggu approval buyer"}</strong></li></dl></section>;
}
