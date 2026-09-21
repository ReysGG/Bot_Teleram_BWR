import { clerkCommerceEnabled, commerceAccessToken } from "@/lib/commerce-auth";
import { AccountConnect } from "@/components/account/account-connect";
import { auth } from "@clerk/nextjs/server";
import { AccountRequired } from "@/components/auth/account-required";
import { OrderAccessForm } from "@/components/orders/order-access-form";
import { OrdersDashboard } from "@/components/orders/orders-dashboard";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { loadCustomerOrders } from "@/lib/store-api";

import Link from "next/link";
import { PageHeading } from "@/components/site/page-heading";

export const dynamic = "force-dynamic";

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string; status?: string }> }) {
  if (!(await auth()).userId) return <AccountRequired label="Pesanan" returnTo="/orders" imageSrc="/headings/orders-heading.png" />;
  const sessionToken = await commerceAccessToken();
  const accountMode = clerkCommerceEnabled();
  const result = sessionToken ? await loadCustomerOrders(sessionToken, await searchParams).catch(() => null) : null;
  return (
    <>
      <SiteHeader active="orders" />
      <main className="storefront-main orders-workspace">
        <PageHeading breadcrumbs={<><Link href="/">Home</Link> / Pesanan</>} title="Pantau pesananmu."
          description="Lihat status pembayaran dan ambil produk digitalmu dari satu tempat."
          imageUrl="/headings/orders-heading.png" imageAlt="Ilustrasi pengelolaan pesanan digital" imageFit="contain" imageTreatment="natural" />
        <div className="orders-workspace-content page-width">
        {!result ? (
          accountMode ? <AccountConnect enabled signedIn={Boolean(sessionToken)} /> : <section className="order-lookup-card">
            <div className="order-lookup-heading"><p className="breadcrumbs">Home / Pesanan</p><h1>Cari pesananmu.</h1><p>Masukkan email atau kode invoice, lalu gunakan password yang dibuat saat checkout.</p></div>
            <OrderAccessForm />
            <aside className="order-safety-note"><strong>Simpan kode invoice dan passwordmu.</strong><span>Kami tidak menampilkan isi produk sebelum password berhasil diverifikasi.</span></aside>
          </section>
        ) : (
          <>
          <OrdersDashboard key={JSON.stringify(result.pagination)} orders={result.orders} customer={result.customer} pagination={result.pagination} />
          </>
        )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
