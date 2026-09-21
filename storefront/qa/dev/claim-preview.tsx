import Link from "./mock-link";
import { OrderResources } from "../../src/components/orders/order-resources";
import { SupportCard } from "../../src/components/site/support-card";
import { Icon } from "../../src/components/ui/icon";

const text = "Cara aktivasi produk\n\n1. Download file produk dari pesanan ini.\n2. Buka tempat claim melalui tombol di bawah.\n3. Masukkan kode dari file dan ikuti petunjuk pada halaman claim.\n4. Simpan hasil aktivasi serta nomor invoice.\n\nPanduan tambahan tersedia di sini.\n\nJangan membagikan kode produk kepada orang lain.";
export function ClaimPreview() {
  return <main className="storefront-main page-width" style={{ paddingBlock: "28px 80px" }}>
    <p className="breadcrumbs"><Link href="/orders">Pesanan</Link> / DEMO-CLAIM-001</p>
    <div className="order-detail-heading"><div><h1 style={{ fontSize: "clamp(1.8rem, 4vw, 2.5rem)" }}>Produk digital & panduan claim</h1><p>Preview pesanan berhasil. Kode dan link di halaman ini hanya contoh.</p></div><Link className="button button-quiet" href="/orders">Kembali ke pesanan</Link></div>
    <section className="claim-success-banner"><Icon name="circle-check" size={30} aria-hidden="true" /><div><h2>Pembayaran berhasil</h2><p>Produk siap diambil. Lanjutkan dengan panduan aktivasi di bawah.</p></div></section>
    <section id="order-products" tabIndex={-1} className="order-delivery-panel"><div><h2>Ambil produkmu</h2><p>File contoh berisi kode demo yang tidak dapat diredeem.</p></div><div className="web-delivery-list"><article><div><strong>contoh-produk.txt</strong><span>1 unit - file contoh</span></div><a className="button button-primary" download="contoh-produk.txt" href="data:text/plain;charset=utf-8,DEMO%20ONLY%0AKode%3A%20DEMO-NOT-VALID%0ABukan%20produk%20atau%20kode%20redeem%20nyata.">Download produk <Icon name="arrow-right" size={17} aria-hidden="true" /></a></article></div></section>
    <OrderResources invoiceNumber="DEMO-CLAIM-001" guidance={[{ productId: "demo-claim", productName: "Lisensi digital (contoh)", text, redeemUrl: "https://example.com/", entities: [{ type: "bold", offset: 0, length: "Cara aktivasi produk".length }, { type: "text_link", offset: text.indexOf("Panduan tambahan tersedia di sini."), length: "Panduan tambahan tersedia di sini.".length, url: "https://example.com/" }] }]} attachments={[{ productId: "demo-claim", productName: "Lisensi digital (contoh)", filename: "panduan-aktivasi.txt", downloadPath: "/api/orders/DEMO-CLAIM-001/attachments/demo-claim" }]} />
    <SupportCard invoice="DEMO-CLAIM-001" />
  </main>;
}
