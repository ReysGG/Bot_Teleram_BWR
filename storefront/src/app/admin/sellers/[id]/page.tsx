import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getAdminSellerDetail } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(value ?? 0)}`;
export default async function AdminSellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [admin, counts, seller] = await Promise.all([requireAdminPage(), getAdminInventoryCounts(), getAdminSellerDetail(id)]);
  if (!seller) notFound();
  return <AdminShell active="sellers" counts={counts} email={admin.email} eyebrow="Seller detail" title={seller.displayName} description={`${seller.slug} · komisi ${seller.commissionBps} bps · policy v${seller.policyVersion}`}>
    <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/sellers">← Semua seller</Link><Link className="button button-quiet" href="/admin/sellers/withdrawals">Review payout</Link></div>
    <section className="metric-grid seller-admin-metrics"><div className="metric-card"><small>Pending</small><strong>{money(seller.wallet?.pending)}</strong></div><div className="metric-card"><small>Available</small><strong>{money(seller.wallet?.available)}</strong></div><div className="metric-card"><small>Held</small><strong>{money(seller.wallet?.held)}</strong></div><div className="metric-card"><small>Debt</small><strong>{money(seller.wallet?.debt)}</strong></div></section>
    <section className="panel"><h2>Membership</h2>{seller.memberships.length ? <ul className="seller-admin-list">{seller.memberships.map((membership) => <li key={`${membership.clerkIssuer}:${membership.clerkUserId}`}><span>{membership.clerkUserId}</span><span className="seller-status">{membership.active ? "Aktif" : "Nonaktif"}</span></li>)}</ul> : <div className="seller-empty"><strong>Belum ada membership</strong><p>Seller belum menghubungkan akun Clerk.</p></div>}</section>
    <section className="panel"><h2>Draft produk terbaru</h2>{seller.drafts.length ? <div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Produk</th><th>Status</th><th>Harga</th><th>Diperbarui</th></tr></thead><tbody>{seller.drafts.map((draft) => <tr key={draft.id}><td>{draft.name}</td><td><span className="seller-status">{draft.status}</span></td><td>{money(draft.price)}</td><td>{draft.updatedAt.toLocaleDateString("id-ID")}</td></tr>)}</tbody></table></div> : <p className="seller-muted">Belum ada draft.</p>}</section>
    <section className="panel"><h2>Payout terakhir</h2>{seller.withdrawals.length ? <div className="seller-table-wrap"><table className="seller-table"><thead><tr><th>Nominal</th><th>Rekening</th><th>Status</th><th>Operator</th><th>Dibuat</th></tr></thead><tbody>{seller.withdrawals.map((withdrawal) => <tr key={withdrawal.id}><td>{money(withdrawal.amount)}</td><td>{withdrawal.account.bank} · {withdrawal.account.masked}</td><td><span className="seller-status">{withdrawal.status}</span></td><td>{withdrawal.operator ?? "—"}</td><td>{withdrawal.createdAt.toLocaleDateString("id-ID")}</td></tr>)}</tbody></table></div> : <p className="seller-muted">Belum ada permintaan payout.</p>}</section>
  </AdminShell>;
}
