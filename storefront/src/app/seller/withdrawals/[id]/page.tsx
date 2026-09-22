import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSellerPage } from "@/server/seller/access";
import { getSellerWithdrawal } from "@/server/seller/portal";

const money = (value: bigint | number | null | undefined) => `Rp ${new Intl.NumberFormat("id-ID").format(Number(value ?? 0))}`;
export const dynamic = "force-dynamic";

export default async function SellerWithdrawalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const seller = await requireSellerPage();
  const { id } = await params;
  const withdrawal = await getSellerWithdrawal(seller.id, id);
  if (!withdrawal) notFound();
  return <section className="seller-panel"><Link className="seller-back-link" href="/seller/withdrawals">← Penarikan</Link><p className="seller-eyebrow">TIMELINE PAYOUT</p><h1>{money(withdrawal.amount)}</h1><p className="seller-muted">Permintaan dicatat {withdrawal.createdAt.toLocaleString("id-ID")}.</p><dl className="seller-admin-list"><li><span>Status</span><strong className="seller-status">{withdrawal.status}</strong></li><li><span>Rekening</span><strong>{withdrawal.account.bank} - {withdrawal.account.masked}</strong></li><li><span>Pemilik</span><strong>{withdrawal.account.holder}</strong></li><li><span>Referensi</span><strong>{withdrawal.reference ?? "Menunggu transfer admin"}</strong></li><li><span>Catatan</span><strong>{withdrawal.reason ?? "Tidak ada catatan"}</strong></li></dl></section>;
}
