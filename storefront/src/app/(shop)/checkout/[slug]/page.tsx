import { notFound } from "next/navigation";
import { ProductCheckout } from "@/components/checkout/product-checkout";
import { CheckoutHeading } from "@/components/checkout/checkout-heading";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import { AccountConnect } from "@/components/account/account-connect";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { loadStorefrontAccount } from "@/lib/store-api";
import { StoreApiError } from "@/lib/telegram-store-api";

export const dynamic = "force-dynamic";

export default async function ProductCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ qty?: string }>;
}) {
  if (!(await auth()).userId) {
    const route = await params;
    const query = await searchParams;
    const quantity = Number.parseInt(query.qty ?? "1", 10);
    return <AccountRequired label="Checkout" returnTo={`/checkout/${encodeURIComponent(route.slug)}?qty=${Number.isFinite(quantity) ? quantity : 1}`} description="Masuk ke akunmu untuk melanjutkan checkout. Pilihan produkmu tetap tersimpan." />;
  }
  const [catalog, route, query] = await Promise.all([
    loadCatalogSnapshot(),
    params,
    searchParams,
  ]);
  const product = catalog.products.find((item) => item.slug === route.slug);
  if (!product) notFound();
  const requestedQuantity = Number.parseInt(query.qty ?? "1", 10);
  const accountMode = clerkCommerceEnabled();
  const token = accountMode ? await commerceAccessToken() : undefined;
  let account; let accountError;
  if (token) try { account = await loadStorefrontAccount(token); } catch (error) { accountError = error instanceof StoreApiError ? error.code : "account_unavailable"; }

  return (
    <>
      <SiteHeader />
      <main className="storefront-main checkout-page">
        <CheckoutHeading productName={product.name} productSlug={product.slug} />
        {accountMode && !account ? <div className="account-content page-width"><AccountConnect enabled signedIn={Boolean(token)} initialCode={accountError} /></div> : <ProductCheckout
          readOnly={process.env.STOREFRONT_PREVIEW_READ_ONLY === "true"}
          accountMode={accountMode}
          account={account ? { contactMasked: account.customer.contactMasked, ...account.wallet } : undefined}
          initialQuantity={Number.isFinite(requestedQuantity) ? requestedQuantity : 1}
          paymentMethods={catalog.paymentMethods}
          product={product}
        />}
      </main>
      <SiteFooter />
    </>
  );
}
