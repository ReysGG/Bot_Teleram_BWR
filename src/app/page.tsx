import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <div className="orb orb-one" />
      <div className="orb orb-two" />
      <section className="landing-card">
        <p className="eyebrow">Independent Telegram Commerce</p>
        <h1>Stok digital masuk rapi. File terkirim tepat sekali.</h1>
        <p className="lede">
          Produk, pembayaran, file stok terenkripsi, pemeriksaan status, dan
          pengiriman Telegram hidup dalam satu layanan mandiri.
        </p>
        <div className="feature-strip">
          <span>Encrypted at rest</span>
          <span>401/402 credential detection</span>
          <span>At-most-once delivery</span>
        </div>
        <Link className="button button-primary" href="/admin">
          Buka dashboard admin
        </Link>
      </section>
    </main>
  );
}
