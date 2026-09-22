import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getAdminSellerIndex } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(value ?? 0)}`;

export default async function AdminSellersPage() {
  const [admin, counts, sellers] = await Promise.all([requireAdminPage(), getAdminInventoryCounts(), getAdminSellerIndex()]);
  return <AdminShell active="sellers" counts={counts} email={admin.email} eyebrow="Seller operations" title="Seller" description="Kelola akses seller, review produk, settlement, dan permintaan payout dalam satu ledger terpisah.">
    <div className="seller-admin-actions"><Link className="button button-primary" href="/admin/sellers/invite">Undang seller</Link><Link className="button button-quiet" href="/admin/sellers/withdrawals">Review payout</Link><Link className="button button-quiet" href="/admin/seller-products/reviews">Review produk</Link></div>
    <section className="panel"><div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Seller</th><th>Status</th><th>Membership</th><th>Produk</th><th>Penjualan</th><th>Saldo tersedia</th><th /></tr></thead><tbody>{sellers.map((seller) => <tr key={seller.id}><td><Link href={`/admin/sellers/${seller.id}`}><strong>{seller.displayName}</strong></Link><small>{seller.slug}</small></td><td><span className="seller-status">{seller.status}</span></td><td>{seller.memberships.some((m) => m.active) ? "Aktif" : "Belum aktif"}</td><td>{seller._count.products}</td><td>{seller._count.sales}</td><td>{money(seller.wallet?.available)}</td><td><Link href={`/admin/sellers/${seller.id}`}>Detail</Link></td></tr>)}</tbody></table></div>{sellers.length === 0 ? <div className="seller-empty"><strong>Belum ada seller</strong><p>Buat undangan pertama untuk memulai seller portal.</p></div> : null}</section>
  </AdminShell>;
}
