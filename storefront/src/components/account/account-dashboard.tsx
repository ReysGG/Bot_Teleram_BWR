import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { SupportCard } from "@/components/site/support-card";
import { formatRupiah } from "@/lib/catalog-types";

export function AccountHero() {
  return <section className="account-hero"><div className="page-width account-hero-inner">
    <div className="account-hero-copy"><p className="breadcrumbs"><Link href="/">Home</Link> / Akun</p><h1>Akun belanjamu.</h1><p>Kelola pesanan, ambil produk digital, dan lihat saldo refund dari satu tempat.</p><span><Icon name="shield-check" size={16} aria-hidden="true" /> Ruang pribadi untuk belanjamu</span></div>
    <div className="account-hero-art" aria-hidden="true">
      <Image className="account-art-leaves" src="/account/account-leaves.png" alt="" width={160} height={160} sizes="160px" />
      <Image className="account-art-character" src="/account/account-character.png" alt="" width={340} height={227} sizes="(max-width: 800px) 260px, 340px" priority />
      <Image className="account-art-cart" src="/account/account-cart.png" alt="" width={190} height={127} sizes="190px" />
      <Image className="account-art-download" src="/account/account-download.png" alt="" width={180} height={120} sizes="180px" />
      <Image className="account-art-wallet" src="/account/account-wallet.png" alt="" width={150} height={100} sizes="150px" />
      <Image className="account-art-package" src="/account/account-package.png" alt="" width={95} height={95} sizes="95px" />
    </div>
  </div></section>;
}

export function AccountDashboard({ contact, balance }: { contact: string; balance: number }) {
  return <div className="account-dashboard-content page-width">
    <div className="account-dashboard-grid">
      <section className="account-welcome-panel"><div className="account-panel-heading"><span className="account-panel-icon"><Icon name="user" size={25} aria-hidden="true" /></span><div><span className="account-eyebrow">AKUN PRIBADI</span><h2>Selamat datang kembali</h2><p>{contact}</p></div></div><p>Pantau pesanan dan akses produk yang sudah kamu beli.</p>
        <div className="account-action-list"><Link href="/orders"><Icon name="receipt" size={21} aria-hidden="true" /><span><strong>Pesanan & download</strong><small>Lihat status dan ambil produkmu</small></span><Icon name="arrow-right" size={18} aria-hidden="true" /></Link><Link href="/cart"><Icon name="cart" size={21} aria-hidden="true" /><span><strong>Keranjang belanja</strong><small>Lanjutkan pilihan produkmu</small></span><Icon name="arrow-right" size={18} aria-hidden="true" /></Link></div>
      </section>
      <section className="account-wallet-panel"><div className="account-panel-heading"><span className="account-panel-icon"><Icon name="wallet" size={25} aria-hidden="true" /></span><div><span className="account-eyebrow">SALDO AKUN</span><h2>Saldo refund</h2></div></div><strong className="account-wallet-amount">{formatRupiah(balance)}</strong><p>Saldo tersedia untuk digunakan saat checkout di website. Saldo Telegram dikelola terpisah.</p><Link href="/account/wallet" className="button button-primary">Lihat riwayat saldo <Icon name="arrow-right" size={17} aria-hidden="true" /></Link><Link className="account-shop-link" href="/shop">Cari produk <Icon name="arrow-right" size={15} aria-hidden="true" /></Link></section>
    </div>
    <SupportCard />
  </div>;
}
