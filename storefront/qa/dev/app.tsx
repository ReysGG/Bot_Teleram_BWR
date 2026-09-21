import { ModalScrollPreview } from "./modal-scroll-preview";
import { SmsWorkspace } from "../../src/components/sms/sms-workspace";
import { SmsOrders } from "../../src/components/sms/sms-orders";
import { FloatingQuickLinks } from "../../src/components/site/floating-quick-links";
import { SearchLayerPreview } from "./search-layer-preview";
import { OrderDetailPreview } from "./order-detail-preview";
import { CartSkeleton } from "../../src/components/cart/cart-skeleton";
import { RevealPreview } from "./reveal-preview";
import { ClaimPreview } from "./claim-preview";
import { createRoot } from "react-dom/client";
import { CartProvider } from "./mock-cart";
import Link from "./mock-link";
import { usePathname } from "./mock-navigation";
import { SiteHeader } from "../../src/components/site/site-header";
import { SiteFooter } from "../../src/components/site/site-footer";
import { PageHeading } from "../../src/components/site/page-heading";
import { ProductCard } from "../../src/components/catalog/product-card";
import { ProductArtwork } from "../../src/components/catalog/product-artwork";
import { AddToCartButton } from "../../src/components/catalog/add-to-cart-button";
import { CartWorkspace } from "../../src/components/cart/cart-workspace";
import { AccountDashboard, AccountHero } from "../../src/components/account/account-dashboard";
import { OrdersDashboard } from "../../src/components/orders/orders-dashboard";
import { CheckoutHeading } from "../../src/components/checkout/checkout-heading";
import { ProductCheckout } from "../../src/components/checkout/product-checkout";
import { SupportCard } from "../../src/components/site/support-card";
import type { StorefrontProduct } from "../../src/lib/catalog-types";
import type { StorefrontOrderSummary } from "../../src/lib/store-api-contract";
import "../../src/app/globals.css";

const product: StorefrontProduct = { id: "demo-mail", slug: "demo-mail", name: "Mail Outlook/Hotmail (Random)", variantLabel: null, description: "Produk contoh untuk menguji tampilan dan keranjang lokal.", price: 500, imageUrl: null, group: { id: "email", slug: "email", name: "Per Emailan", imageUrl: null }, readyStock: 548, reservedStock: 0, preorderEnabled: false, preorderEtaText: null, availability: "IN_STOCK", featured: true, tags: [] };
const products: StorefrontProduct[] = [product, { ...product, id: "demo-temp", slug: "demo-temp", name: "Temp Mail .com", readyStock: 11 }, { ...product, id: "demo-api", slug: "demo-api", name: "Paket business 200 coin token AI", price: 60000, readyStock: 2, availability: "LOW_STOCK" }, { ...product, id: "demo-out", slug: "demo-out", name: "ChatGPT Plus (contoh stok habis)", price: 75000, readyStock: 0, availability: "OUT_OF_STOCK" }];
const order: StorefrontOrderSummary = { id: "expired", invoiceNumber: "DEMO-EXPIRED-001", createdAt: "2026-09-16T01:00:00Z", expiresAt: "2026-09-16T01:05:00Z", paidAt: null, completedAt: null, status: "EXPIRED", paymentStatus: "EXPIRED", paymentMethod: "QRIS", billedAmount: 567, grandTotal: 500, productName: product.name, variantLabel: null, quantity: 1, deliveryState: "EXPIRED", readyFiles: 0, deliveredFiles: 0 };
const orders = [order, { ...order, id: "ready", invoiceNumber: "DEMO-READY-002", status: "PAID", paymentStatus: "PAID", deliveryState: "READY" as const, readyFiles: 1 }, { ...order, id: "pending", invoiceNumber: "DEMO-PENDING-003", status: "PENDING_PAYMENT", paymentStatus: "PENDING", deliveryState: "WAITING_PAYMENT" as const }];

function Preview() {
  const pathname = usePathname();
  const item = products.find(p => pathname === `/products/${p.slug}`) ?? product;
  return <><aside style={{ padding: "9px 16px", background: "#fff6d9", fontSize: 12, textAlign: "center", color: "#715600" }}>DEV UI · Data contoh · Keranjang hanya di memori browser · Tidak membuat transaksi nyata <Link href="/shop">Shop</Link> · <Link href="/orders">Pesanan</Link> · <Link href="/account">Akun</Link></aside>
    {pathname === "/cart" ? <CartWorkspace products={products} /> : <><SiteHeader active={pathname === "/search-layer-preview" ? "home"
    : pathname.startsWith("/sms") ? "sms" : pathname.startsWith("/account") ? "account" : pathname.startsWith("/orders") ? "orders" : "shop"} />
    {pathname === "/sms" ? <SmsWorkspace />
    : pathname === "/sms/orders" ? <SmsOrders />
    : pathname.startsWith("/sms/orders/") ? <SmsOrders orderId="demo-sms-order" />
    : pathname === "/modal-scroll-preview" ? <ModalScrollPreview />
    : pathname === "/search-layer-preview" ? <SearchLayerPreview products={products} />
    : pathname.startsWith("/account") ? <main className="storefront-main account-dashboard"><AccountHero /><AccountDashboard contact="de***@example.com" balance={500} /></main>
    : pathname === "/orders" ? <main className="storefront-main orders-workspace"><PageHeading title="Pantau pesananmu." breadcrumbs="Home / Pesanan" description="Lihat status pembayaran dan ambil produk digitalmu dari satu tempat." imageUrl="/headings/orders-heading.png" imageAlt="Ilustrasi pesanan" imageFit="contain" imageTreatment="natural" /><div className="orders-workspace-content page-width"><OrdersDashboard orders={orders} customer={{ contactMasked: "de***@example.com", walletBalance: 500 }} /></div></main>
    : pathname === "/cart-loading" ? <main className="page-width" style={{paddingBlock:40}}><h1>Keranjang sedang dimuat</h1><CartSkeleton /></main>
    : pathname === "/orders/DEMO-REVEAL" ? <RevealPreview />
    : pathname === "/orders/DEMO-CLAIM-001" ? <ClaimPreview />
    : pathname === "/orders/DEMO-INVOICE-001" ? <OrderDetailPreview />
    : pathname.startsWith("/orders/") ? <main className="page-width" style={{ paddingBlock: 40 }}><h1 style={{ fontSize: 32 }}>Invoice kedaluwarsa</h1><p>Contoh UI bantuan. Tidak ada pembayaran atau produk nyata di sini.</p><SupportCard invoice={pathname.split("/").at(-1)} /></main>
    : pathname.startsWith("/products/") ? <main className="storefront-main"><div className="page-width product-detail"><ProductArtwork product={item} size="detail" /><div className="product-detail-copy"><h1>{item.name}</h1><p>{item.description}</p><div className="product-buy-actions"><Link className="button button-primary" href="/checkout/demo">Beli sekarang</Link><AddToCartButton product={item} /></div><SupportCard compact /></div></div></main>
    : pathname.startsWith("/checkout") ? <main className="storefront-main checkout-page"><CheckoutHeading productName={product.name} productSlug={product.slug} /><ProductCheckout readOnly={pathname !== "/checkout/demo-modal"} initialQuantity={2} accountMode account={{ contactMasked: "de***@example.com", balance: 500, walletEnabled: true, mixedQrisEnabled: true }} paymentMethods={["QRIS", "Bank Jago", "USDT BEP20"]} product={product} /></main>
    : <main className="storefront-main" data-no-motion><PageHeading title="Cari produk pilihanmu." breadcrumbs="Home / Shop" description="Uji tombol Tambah dan preview cart tanpa mengubah data produksi." imageUrl="/headings/shop-heading.png" /><div className="page-width" style={{ paddingBlock: 32 }}><div className="product-grid">{products.map(p => <ProductCard key={p.id} product={p} />)}</div></div></main>}
    <SiteFooter /><FloatingQuickLinks /></>}
  </>;
}
createRoot(document.getElementById("root")!).render(<CartProvider><Preview /></CartProvider>);
