import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import styles from "./site-footer.module.css";

export function SiteFooter() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() || null;
  const groupUrl = process.env.STOREFRONT_TELEGRAM_GROUP_URL || "https://t.me/+apR5dsE0r4M4OGJl";
  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;
  const external = { target: "_blank", rel: "noopener noreferrer" };
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.main}>
          <nav className={styles.column} aria-label="Belanja di BWR Tele">
            <h2>Belanja</h2>
            <Link href="/shop">Semua produk</Link>
            <Link href="/categories">Kategori</Link>
            <Link href="/cart">Keranjang</Link>
          </nav>
          <nav className={styles.column} aria-label="Akun dan pesanan">
            <h2>Akunmu</h2>
            <Link href="/account">Akun saya</Link>
            <Link href="/orders">Pesanan & download</Link>
            <Link href="/account/wallet">Saldo & riwayat</Link>
          </nav>
          <nav className={styles.column} aria-label="Bantuan dan komunitas">
            <h2>Temui kami</h2>
            <a href="https://t.me/davidboysaja" {...external}>Telegram admin</a>
            <a href={groupUrl} {...external}>Grup Telegram</a>
            {botUrl ? <a href={botUrl} {...external}>Telegram bot</a> : null}
            <a href="https://www.threads.com/@buildwithreys_ai" {...external}>Threads</a>
          </nav>
          <section className={styles.community} aria-labelledby="footer-community-heading">
            <Link className={styles.brand} href="/" aria-label="BWR Tele beranda"><span className={styles.mark}>B</span><span>BWR <em>TELE</em></span></Link>
            <h2 id="footer-community-heading">Sampai ketemu di komunitas.</h2>
            <p>Ikuti kabar terbaru, berbagi cerita, dan temukan bantuan untuk pesananmu.</p>
            <a className={styles.join} href={groupUrl} {...external}>Gabung grup Telegram <Icon name="arrow-right" size={17} aria-hidden="true" /></a>
            <div className={styles.socials} aria-label="Media sosial BWR Tele">
              <a href="https://t.me/davidboysaja" {...external} aria-label="Chat admin Telegram" title="Telegram admin"><Icon name="user" size={20} aria-hidden="true" /></a>
              <a href={groupUrl} {...external} aria-label="Grup Telegram" title="Grup Telegram"><Icon name="send" size={20} aria-hidden="true" /></a>
              {botUrl ? <a href={botUrl} {...external} aria-label="Bot Telegram" title="Telegram bot"><Icon name="store" size={20} aria-hidden="true" /></a> : null}
              <a href="https://www.threads.com/@buildwithreys_ai" {...external} aria-label="Threads @buildwithreys_ai" title="Threads @buildwithreys_ai"><span className={styles.threads} aria-hidden="true">@</span></a>
              <span className={styles.handle}>@buildwithreys_ai</span>
            </div>
          </section>
        </div>
        <div className={styles.bottom}>
          <span>© {new Date().getFullYear()} BWR Tele. Semua hak dilindungi.</span>
          <span>Pilih produkmu. Selesaikan pembayaran. Unduh dari pesanan.</span>
        </div>
      </div>
    </footer>
  );
}
