import Link from "next/link";
import { requireSellerPage } from "@/server/seller/access";
import { getSellerDashboard } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(value ?? 0)}`;
const date = (value: Date) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium" }).format(value);

export default async function SellerPage() {
  const seller = await requireSellerPage();
  const dashboard = await getSellerDashboard(seller.id);
  const wallet = dashboard.wallet;
  return <>
    <header className="seller-heading"><div><p className="seller-eyebrow">PORTAL SELLER · {seller.slug}</p><h1>Halo, {seller.displayName}.</h1><p>Kelola produk, pantau penjualan, dan lihat saldo settlement dari satu ruang kerja.</p></div><span className="seller-status seller-status-active">Aktif</span></header>
    <section className="seller-metrics seller-metrics-four"><div><small>Produk aktif/nonaktif</small><strong>{dashboard.productCount}</strong></div><div><small>Penjualan tercatat</small><strong>{dashboard.saleCount}</strong></div><div><small>Saldo tersedia</small><strong>{money(wallet?.available)}</strong></div><div><small>Saldo ditahan</small><strong>{money(wallet?.held)}</strong></div></section>
    <section className="seller-grid"><article><strong>Produk saya</strong><span>{dashboard.draftCounts.DRAFT ?? 0} draft · {dashboard.draftCounts.SUBMITTED ?? 0} menunggu review · {dashboard.draftCounts.APPROVED ?? 0} disetujui.</span><Link href="/seller/products">Buka produk</Link></article><article><strong>Penjualan</strong><span>Ringkasan unit terjual, gross, komisi, dan net settlement.</span><Link href="/seller/sales">Lihat penjualan</Link></article><article><strong>Saldo & payout</strong><span>Tersedia {money(wallet?.available)} · pending {money(wallet?.pending)}.</span><Link href="/seller/balance">Buka saldo</Link></article></section>
    <section className="seller-panel seller-table-panel"><div className="seller-panel-heading"><div><p className="seller-eyebrow">AKTIVITAS TERBARU</p><h2>Penjualan terakhir</h2></div><Link href="/seller/sales">Lihat semua</Link></div>{dashboard.recentSales.length ? <div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Produk</th><th>Invoice</th><th>Net</th><th>Status</th><th>Tanggal</th></tr></thead><tbody>{dashboard.recentSales.map((sale) => <tr key={sale.id}><td>{sale.orderItem.productNameSnapshot}</td><td>{sale.orderItem.order.invoiceNumber}</td><td>{money(sale.net)}</td><td><span className="seller-status">{sale.status}</span></td><td>{date(sale.createdAt)}</td></tr>)}</tbody></table></div> : <div className="seller-empty"><strong>Belum ada penjualan</strong><p>Penjualan muncul setelah produk disetujui dan order berhasil dipenuhi.</p></div>}</section>
  </>;
}
