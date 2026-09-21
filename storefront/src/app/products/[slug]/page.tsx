import { ResumeCartAddition } from "@/components/cart/resume-cart-addition";
import { SupportCard } from "@/components/site/support-card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { AddToCartButton } from "@/components/catalog/add-to-cart-button";
import { ProductArtwork } from "@/components/catalog/product-artwork";
import { ProductSales } from "@/components/catalog/product-sales";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Icon } from "@/components/ui/icon";
import { loadCatalogSnapshot } from "@/lib/catalog-model";
import {
  formatRupiah,
  productAvailabilityLabel,
  productCanEnterCart,
} from "@/lib/catalog-types";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [catalog, route, session] = await Promise.all([loadCatalogSnapshot(), params, auth()]);
  const product = catalog.products.find((item) => item.slug === route.slug);
  if (!product) notFound();

  return (
    <>
      <SiteHeader active="shop" />
      <main className="storefront-main page-width">
        <section className="product-detail">
          <div className="product-detail-art">
            <ProductArtwork product={product} size="detail" />
          </div>
          <div className="product-detail-copy">
            <p className="breadcrumbs"><Link href="/shop">Shop</Link> / {product.group ? <Link href={"/categories/" + product.group.slug}>{product.group.name}</Link> : "Produk"} / {product.variantLabel ?? product.name}</p>
            <h1>{product.name}</h1>
            <p className="product-detail-description">{product.description.replace(/\s*•[ \t]*/g, "\n• ").trim()}</p>
            <div className="product-detail-price">
              <strong>{formatRupiah(product.price)}</strong>
              <span className={"stock-pill stock-" + product.availability.toLowerCase()}>
                {productAvailabilityLabel(product)}
              </span>
            </div>
            <div className="product-facts">
              <ProductSales count={product.soldCount} />
              <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Unduh produk dari halaman pesanan setelah pembayaran</span>
              <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Harga dan stok dicek saat checkout</span>
              <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Setiap unit punya stok sendiri</span>
              {product.preorderEnabled ? <span><b><Icon aria-hidden="true" name="check" size={14} strokeWidth={2.8} /></b> Bisa preorder saat stok tersedia</span> : null}
            </div>
            <ResumeCartAddition product={product} />
            <div className="product-buy-actions">
              {productCanEnterCart(product) ? <Link className="button button-primary" href={session.userId ? "/checkout/" + product.slug : "/sign-in?redirect_url=" + encodeURIComponent("/checkout/" + product.slug)}>{session.userId ? "Beli sekarang" : "Masuk untuk membeli"}</Link> : <button className="button button-primary" disabled type="button">Stok habis</button>}
              <AddToCartButton product={product} />
            </div>
          </div>
        </section>
        <div className="page-width product-support"><SupportCard compact /></div>
      </main>
      <SiteFooter />
    </>
  );
}
