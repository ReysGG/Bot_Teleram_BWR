import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page page-width">
      <Link className="site-logo" href="/">BWR <em>TELE</em></Link>
      <span className="not-found-code">404</span>
      <h1>Halaman belum ditemukan.</h1>
      <p>Produk atau halaman yang kamu cari mungkin sudah tidak tersedia. Kamu bisa kembali melihat katalog.</p>
      <Link className="button button-primary" href="/shop">Kembali belanja</Link>
    </main>
  );
}
