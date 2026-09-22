import Link from "next/link";
import { requireSellerPage } from "@/server/seller/access";
import { getSellerPayoutAccounts } from "@/server/seller/portal";
export const dynamic = "force-dynamic";

export default async function SellerPayoutAccountsPage() {
  const seller = await requireSellerPage();
  const accounts = await getSellerPayoutAccounts(seller.id);
  return <section className="seller-panel"><Link className="seller-back-link" href="/seller/withdrawals">← Penarikan</Link><div className="seller-panel-heading"><div><p className="seller-eyebrow">REKENING PAYOUT</p><h1>Akun pencairan</h1></div></div>{accounts.length ? <div className="seller-grid">{accounts.map(account => <article key={account.id} className="seller-notice"><strong>{account.bank}</strong><span>{account.holder}</span><small>{account.masked} - {account.status}</small></article>)}</div> : <div className="seller-empty"><strong>Belum ada akun payout terverifikasi</strong><p>Admin perlu memverifikasi rekening sebelum seller dapat mengajukan pencairan.</p></div>}</section>;
}
