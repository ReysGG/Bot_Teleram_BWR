import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Icon } from "@/components/ui/icon";

export function AuthPageShell({
  accentTitle,
  children,
  description,
  title,
}: {
  accentTitle: string;
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <>
      <SiteHeader />
      <main className="storefront-main auth-page page-width">
        <nav className="auth-mobile-bar" aria-label="Navigasi login">
          <Link className="auth-mobile-brand" href="/">BWR <span>TELE</span></Link>
          <Link href="/shop"><Icon aria-hidden="true" name="chevron-left" size={16} /> Kembali belanja</Link>
        </nav>
        <section className="auth-intro-panel">
          <div className="auth-intro-copy">
            <p className="auth-kicker">Akun BWR Tele</p>
            <h1>
              {title}
              <span>{accentTitle}</span>
            </h1>
            <p className="auth-description">{description}</p>
          </div>

          <div className="auth-benefits">
            <div>
              <span className="auth-benefit-icon auth-benefit-icon-blue"><Icon aria-hidden="true" name="bolt" size={20} /></span>
              <p><strong>Akses semua produk</strong><small>Riwayat pembelianmu tersimpan lebih rapi.</small></p>
            </div>
            <div>
              <span className="auth-benefit-icon auth-benefit-icon-green"><Icon aria-hidden="true" name="shield-check" size={20} /></span>
              <p><strong>Akun aman dan terlindungi</strong><small>Verifikasi akun membantu menjaga aksesmu.</small></p>
            </div>
            <div>
              <span className="auth-benefit-icon auth-benefit-icon-violet"><Icon aria-hidden="true" name="device-mobile" size={20} /></span>
              <p><strong>Bisa diakses kapan saja</strong><small>Masuk dari HP, tablet, atau desktop.</small></p>
            </div>
          </div>

          <Link className="auth-back-link" href="/shop">
            Kembali lihat produk <Icon aria-hidden="true" name="arrow-right" size={17} />
          </Link>

          <p aria-hidden="true" className="auth-speech-bubble">Produk digitalmu tersimpan lebih rapi.</p>
        </section>
        <section className="auth-clerk-panel">
          {children}
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
