import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getAdminSellerWithdrawals } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(value ?? 0))}`;

export default async function AdminSellerWithdrawalsPage() {
  const [admin, counts, withdrawals] = await Promise.all([requireAdminPage(), getAdminInventoryCounts(), getAdminSellerWithdrawals()]);
  return <AdminShell active="sellers" counts={counts} email={admin.email} eyebrow="Seller payouts" title="Review payout" description="Buka detail untuk memeriksa rekening, alasan, dan menjalankan satu transisi payout.">
    <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/sellers">← Semua seller</Link></div>
    <section className="panel"><div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Seller</th><th>Nominal</th><th>Rekening</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead><tbody>
      {withdrawals.map((withdrawal) => <tr key={withdrawal.id}><td><Link href={`/admin/sellers/${withdrawal.seller.id}`}><strong>{withdrawal.seller.displayName}</strong></Link><small>{withdrawal.seller.slug}</small></td><td>{money(withdrawal.amount)}</td><td>{withdrawal.account.bank}<small>{withdrawal.account.masked}</small></td><td><span className="seller-status">{withdrawal.status}</span></td><td>{withdrawal.createdAt.toLocaleDateString("id-ID")}</td><td><Link className="button button-quiet" href={`/admin/sellers/withdrawals/${withdrawal.id}`}>Buka detail</Link></td></tr>)}
    </tbody></table></div>{withdrawals.length === 0 ? <div className="seller-empty"><strong>Tidak ada payout menunggu</strong><p>Permintaan withdrawal yang belum dibayar akan muncul di sini.</p></div> : null}</section>
  </AdminShell>;
}
