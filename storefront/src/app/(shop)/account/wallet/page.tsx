import Link from "next/link";
import { AccountConnect } from "@/components/account/account-connect";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { PageHeading } from "@/components/site/page-heading";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { loadStorefrontAccount } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { formatRupiah } from "@/lib/catalog-types";

export const dynamic = "force-dynamic";
const labels: Record<string, string> = {
  PURCHASE_DEBIT: "Pembelian produk", PAYMENT_RELEASE_REFUND: "Saldo invoice dikembalikan",
  STOCK_UNAVAILABLE_REFUND: "Refund stok tidak tersedia", DELIVERY_REFUND: "Refund pengiriman",
  PREORDER_CANCEL_REFUND: "Refund preorder", ADMIN_CREDIT: "Penyesuaian saldo masuk", ADMIN_DEBIT: "Penyesuaian saldo keluar",
  SMS_PURCHASE_DEBIT: "Pembelian SMS OTP", SMS_PURCHASE_REFUND: "Refund SMS OTP",
};
export default async function WalletPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  if (!(await auth()).userId) return <AccountRequired label="Saldo" returnTo="/account/wallet" description="Masuk terlebih dahulu untuk melihat saldo refund dan riwayat transaksimu." />;
  const enabled = clerkCommerceEnabled();
  const token = enabled ? await commerceAccessToken() : undefined;
  const { cursor } = await searchParams;
  let account; let code;
  if (token) try { account = await loadStorefrontAccount(token, cursor); } catch (error) { code = error instanceof StoreApiError ? error.code : "account_unavailable"; }
  return <><SiteHeader active="account" /><main className="storefront-main"><PageHeading title="Saldo & riwayatmu." description="Lihat saldo refund dan setiap penggunaan saldo untuk pembelianmu." breadcrumbs={<><Link href="/account">Akun</Link> / Saldo</>} variant="plain" />
    <div className="wallet-content page-width">{account ? <>
      <section className="account-card"><p>Saldo refund · {account.customer.contactMasked}</p><strong className="account-balance">{formatRupiah(account.wallet.balance)}</strong><p>Gunakan saldo saat checkout. Jika kurang, gabungkan dengan QRIS ketika metode tersebut tersedia. Top up Web belum tersedia.</p><Link className="button button-primary" href="/shop">Belanja dengan saldo</Link></section>
      <section className="account-card"><h2>Riwayat saldo</h2>{account.wallet.transactions.length ? <div className="wallet-table-wrap"><table className="wallet-table"><thead><tr><th>Tanggal</th><th>Transaksi</th><th>Perubahan</th><th>Saldo setelahnya</th></tr></thead><tbody>{account.wallet.transactions.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</td><td>{labels[row.type] ?? "Perubahan saldo"}{row.invoiceNumber ? <Link href={`/orders/${encodeURIComponent(row.invoiceNumber)}`}>{row.invoiceNumber}</Link> : null}</td><td className={row.amount > 0 ? "wallet-credit" : "wallet-debit"}>{row.amount > 0 ? "+" : "−"}{formatRupiah(Math.abs(row.amount))}</td><td>{formatRupiah(row.balanceAfter)}</td></tr>)}</tbody></table></div> : <p>Belum ada transaksi saldo.</p>}<div className="account-shortcuts">{cursor ? <Link href="/account/wallet">Riwayat terbaru</Link> : null}{account.wallet.nextCursor ? <Link href={`/account/wallet?cursor=${encodeURIComponent(account.wallet.nextCursor)}`}>Transaksi sebelumnya</Link> : null}</div></section>
    </> : <AccountConnect enabled={enabled} signedIn={Boolean(token)} initialCode={code} />}</div>
  </main><SiteFooter /></>;
}
