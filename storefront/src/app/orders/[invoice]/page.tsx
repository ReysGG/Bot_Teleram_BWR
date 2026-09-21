import { OrderDetailView } from "@/components/orders/order-detail-view";
import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { AccountConnect } from "@/components/account/account-connect";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";
import Link from "next/link";
import { OrderAccessForm } from "@/components/orders/order-access-form";
import { OrderReveal } from "@/components/orders/order-reveal";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCustomerOrder } from "@/lib/store-api";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ invoice: string }> }) {
  const { invoice } = await params;
  if (!(await auth()).userId) return <AccountRequired label="Pesanan" returnTo={`/orders/${encodeURIComponent(invoice)}`} />;
  const sessionToken = await commerceAccessToken();
  const result = sessionToken ? await loadCustomerOrder(sessionToken, invoice).catch(() => null) : null;
  if (!result) {
    if (clerkCommerceEnabled()) return <><SiteHeader active="orders" /><main className="storefront-main orders-page page-width"><section className="account-card"><h1>Pesanan belum dapat dibuka</h1><p>Pastikan akun yang masuk adalah akun pemilik pesanan ini.</p><Link href="/account">Buka akun & saldo</Link></section><AccountConnect enabled signedIn={Boolean(sessionToken)} /></main><SiteFooter /></>;
    return <><SiteHeader active="orders" /><main className="storefront-main orders-page page-width"><section className="order-lookup-card order-detail-access"><div className="order-lookup-heading"><p className="breadcrumbs"><Link href="/orders">Pesanan</Link> / {invoice}</p><h1>Buka pesanan.</h1><p>Masukkan password yang dibuat bersama invoice ini.</p></div><OrderAccessForm initialIdentifier={invoice} returnTo={"/orders/" + encodeURIComponent(invoice)} /></section></main><SiteFooter /></>;
  }
  const order = result.order;
  return (
    <><SiteHeader active="orders" /><main className="storefront-main order-detail-page page-width">
      <OrderReveal key={order.id} order={{ id: order.id, productName: order.productName, status: order.status, paymentStatus: order.paymentStatus, deliveryState: order.deliveryState, quantity: order.quantity, readyFiles: order.readyFiles, deliveredFiles: order.deliveredFiles }} />
      <OrderDetailView order={order} />
    </main><SiteFooter /></>
  );
}
