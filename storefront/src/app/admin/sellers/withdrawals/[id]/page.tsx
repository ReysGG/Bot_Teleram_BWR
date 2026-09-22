import Link from "next/link";
import { WithdrawalActions } from "@/components/admin/sellers/withdrawal-actions";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { requireAdminPage } from "@/server/security/admin-auth";
import { getAdminSellerWithdrawal } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(value ?? 0))}`;

export default async function AdminSellerWithdrawalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const query = await searchParams;
  const [counts, withdrawal] = await Promise.all([getAdminInventoryCounts(), getAdminSellerWithdrawal(id)]);
  if (!withdrawal) notFound();
  const notice = typeof query.notice === "string" ? query.notice : "";
  const error = typeof query.error === "string" ? query.error : "";
  return <AdminShell active="sellers" counts={counts} email={admin.email} eyebrow="Seller payout detail" title={withdrawal.seller.displayName} description={`${withdrawal.seller.slug} · ${withdrawal.id}`}>
    <div className="seller-admin-actions"><Link className="button button-quiet" href="/admin/sellers/withdrawals">← Semua payout</Link><Link className="button button-quiet" href={`/admin/sellers/${withdrawal.seller.id}`}>Profil seller</Link></div>
    {notice ? <p className="alert alert-success" role="status">Pembaruan payout tersimpan.</p> : null}
    {error ? <p className="alert alert-error" role="alert">Aksi belum tersimpan. Kode: {error}</p> : null}
    <section className="panel"><div className="seller-review-detail-grid"><div><p className="eyebrow">Permintaan withdrawal</p><h2>{money(withdrawal.amount)}</h2><dl className="seller-admin-list"><li><span>Status</span><strong className="seller-status">{withdrawal.status}</strong></li><li><span>Rekening</span><strong>{withdrawal.account.bank} · {withdrawal.account.masked}</strong></li><li><span>Pemilik</span><strong>{withdrawal.account.holder}</strong></li><li><span>Dibuat</span><strong>{withdrawal.createdAt.toLocaleString("id-ID")}</strong></li>{withdrawal.reference ? <li><span>Referensi</span><strong>{withdrawal.reference}</strong></li> : null}{withdrawal.reason ? <li><span>Catatan</span><strong>{withdrawal.reason}</strong></li> : null}</dl></div><div><h2>Aksi admin</h2><p>Setiap tombol menjalankan satu transisi state dan dicatat sebagai audit. Transfer tetap manual; jangan tandai paid sebelum referensi tersedia.</p>
      <WithdrawalActions id={id} status={withdrawal.status} version={withdrawal.version} />
    </div></div></section>
  </AdminShell>;
}
