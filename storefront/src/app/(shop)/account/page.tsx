import { AccountConnect } from "@/components/account/account-connect";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { loadStorefrontAccount } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";
import { AccountDashboard, AccountHero } from "@/components/account/account-dashboard";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  if (!(await auth()).userId) return <AccountRequired label="Akun" returnTo="/account" description="Masuk untuk melihat pesanan, produk yang dibeli, dan saldo akunmu." />;
  const enabled = clerkCommerceEnabled();
  const token = enabled ? await commerceAccessToken() : undefined;
  let account; let code;
  if (token) try { account = await loadStorefrontAccount(token); } catch (error) { code = error instanceof StoreApiError ? error.code : "account_unavailable"; }
  return <><SiteHeader active="account" /><main className="storefront-main account-dashboard"><AccountHero />
    {account ? <AccountDashboard contact={account.customer.contactMasked} balance={account.wallet.balance} /> : <div className="account-content page-width"><AccountConnect enabled={enabled} signedIn={Boolean(token)} initialCode={code} /></div>}
  </main><SiteFooter /></>;
}
