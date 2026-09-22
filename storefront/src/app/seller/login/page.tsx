import Link from "next/link";
import { isLocalPreview } from "@/lib/runtime-env";
import { SellerPanel } from "@/components/seller/seller-primitives";

export const dynamic = "force-dynamic";

export default function SellerLoginPage() {
  const local = isLocalPreview();
  return <section className="seller-login-grid">
    <div className="seller-login-art" aria-hidden="true"><span className="seller-login-mark">B</span><span className="seller-login-orbit seller-login-orbit-one" /><span className="seller-login-orbit seller-login-orbit-two" /><div><p className="seller-eyebrow">BWR TELE SELLER</p><strong>Ruang kerja untuk toko digital yang rapi.</strong><small>Produk, stok, penjualan, dan pencairan dalam satu alur.</small></div></div>
    <SellerPanel eyebrow="AKSES SELLER" title="Masuk ke portal seller"><div className="seller-login-copy"><p>{local ? "Mode lokal siap untuk review. Gunakan akses preview untuk melihat seluruh halaman seller." : "Masuk memakai akun yang menerima undangan seller dari admin."}</p>{local ? <Link className="seller-button" href="/seller">Buka preview seller</Link> : <Link className="seller-button" href="/sign-in?redirect_url=%2Fseller">Masuk dengan akun seller</Link>}<Link className="seller-back-link" href="/shop">Kembali ke toko</Link></div></SellerPanel>
  </section>;
}
