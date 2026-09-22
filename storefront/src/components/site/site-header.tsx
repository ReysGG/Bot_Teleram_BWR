"use client";

import {
  Show,
  SignInButton,
  SignUpButton,
} from "@clerk/nextjs";
import { ProfileButton } from "@/components/account/profile-button";
import { ProductSearchInput } from "@/components/catalog/product-search-input";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useCart } from "@/components/cart/cart-context";
import { CartPreview } from "@/components/cart/cart-preview";
import { Icon } from "@/components/ui/icon";
import { useLocalPreview } from "@/components/auth/local-preview-context";

type SiteHeaderProps = { active?: "home" | "shop" | "categories" | "orders" | "account" | "sms" };

export function SiteHeader({ active, mode }: SiteHeaderProps & { mode?: "management" }) {
  const preview = useLocalPreview();
  if (preview || mode === "management") return <PublicHeader management={mode === "management"} />;
  return <CustomerHeader active={active} />;
}

function PublicHeader({management}:{management:boolean}) {
  return <header className="site-header">
    <Link className="site-logo" href="/"><span className="site-logo-mark">B</span><span>BWR <em>TELE</em></span></Link>
    <nav aria-label="Navigasi halaman" style={{display:"flex",gap:20,flexWrap:"wrap"}}>
      <Link href="/shop">Shop</Link><Link href="/categories">Kategori</Link>
      {management ? <><Link href="/admin">Dashboard admin</Link><Link href="/admin/products">Produk</Link><Link href="/admin/inventory/available">Stok</Link></> : <Link href="/seller">Seller</Link>}
    </nav>
    {!management ? <span className="header-sign-in">Pratinjau lokal</span> : null}
  </header>;
}

function CustomerHeader({ active }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { itemCount, error, errorCode, pending, retryRequired, retry } = useCart();
  const linkClass = (key: SiteHeaderProps["active"]) => active === key ? "is-active" : "";

  return (
    <>
      <header className="site-header">
        <Link className="site-logo" href="/">
          <span className="site-logo-mark">B</span>
          <span>BWR <em>TELE</em></span>
        </Link>
        <nav className="desktop-nav" aria-label="Navigasi utama">
          <Link className={linkClass("home")} href="/">Home</Link>
          <Link className={linkClass("shop")} href="/shop">Shop</Link>
          <Link className={linkClass("categories")} href="/categories">Kategori</Link>
          <Link className={linkClass("sms")} href="/sms">SMS OTP</Link>
          <Show when="signed-in">
            <Link className={linkClass("orders")} href="/orders">Pesanan</Link>
            <Link className={linkClass("account")} href="/account">Akun</Link>
          </Show>
        </nav>
        <form className="header-search" action="/shop" method="get">
          <Icon aria-hidden="true" name="search" size={17} strokeWidth={2.2} />
          <ProductSearchInput label="Cari produk" />
        </form>
        <div className="header-tools">
          <CartPreview key={pathname} />
          <Show when="signed-out">
            <div className="header-auth-desktop">
              <SignInButton mode="redirect">
                <button className="header-sign-in" type="button">Masuk</button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <button className="header-sign-up" type="button">Daftar</button>
              </SignUpButton>
            </div>
            <SignInButton mode="redirect">
              <button className="header-auth-mobile" aria-label="Masuk akun" type="button">
                <Icon aria-hidden="true" name="user" size={20} strokeWidth={2.2} />
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <div className="header-user-button">
              <ProfileButton />
            </div>
          </Show>
          <button
            aria-expanded={open}
            aria-label="Buka menu"
            className="mobile-menu-toggle"
            type="button"
            onClick={() => setOpen((value) => !value)}
          >
            {open
              ? <Icon aria-hidden="true" name="x" size={22} strokeWidth={2.3} />
              : <Icon aria-hidden="true" name="menu" size={22} strokeWidth={2.3} />}
          </button>
        </div>
      </header>
      {error ? <div className="cart-feedback" role="alert"><span>{error}</span><Link href={errorCode === "sign_in_required" ? `/sign-in?redirect_url=${encodeURIComponent(pathname)}` : "/cart"}>{errorCode === "sign_in_required" ? "Masuk kembali" : "Buka keranjang"}</Link>{retryRequired ? <button type="button" disabled={pending} onClick={() => void retry()}>{pending ? "Menyimpan..." : "Coba ulang"}</button> : null}</div> : null}
      {open ? (
        <div className="mobile-drawer">
          <Link href="/" onClick={() => setOpen(false)}>Home</Link>
          <Link href="/shop" onClick={() => setOpen(false)}>Shop</Link>
          <Link href="/categories" onClick={() => setOpen(false)}>Kategori</Link>
          <Link href="/sms" onClick={() => setOpen(false)}>SMS OTP</Link>
          <Show when="signed-in">
            <Link href="/orders" onClick={() => setOpen(false)}>Cari pesanan</Link>
            <Link href="/account" onClick={() => setOpen(false)}>Akun & saldo</Link>
          </Show>
          <Link href="/cart" onClick={() => setOpen(false)}>Keranjang ({itemCount})</Link>
          <Show when="signed-out">
            <div className="mobile-drawer-auth">
              <SignInButton mode="redirect">
                <button type="button" onClick={() => setOpen(false)}>Masuk akun</button>
              </SignInButton>
              <SignUpButton mode="redirect">
                <button type="button" onClick={() => setOpen(false)}>Buat akun</button>
              </SignUpButton>
            </div>
          </Show>
          <Show when="signed-in">
            <div className="mobile-drawer-user">
              <span>Akun storefront</span>
              <ProfileButton showName />
            </div>
          </Show>
        </div>
      ) : null}
      <nav className="mobile-bottom-nav" aria-label="Navigasi mobile">
        <Link className={linkClass("home")} href="/"><Icon aria-hidden="true" name="home" size={19} />Home</Link>
        <Link className={linkClass("shop")} href="/shop"><Icon aria-hidden="true" name="store" size={19} />Shop</Link>
        <Link className={linkClass("categories")} href="/categories"><Icon aria-hidden="true" name="grid" size={19} />Kategori</Link>
        <Link className={linkClass("sms")} href="/sms"><Icon aria-hidden="true" name="phone" size={19} />SMS OTP</Link>
        <Show when="signed-in">
          <Link className={linkClass("account")} href="/account"><Icon aria-hidden="true" name="user" size={19} />Akun</Link>
        </Show>
      </nav>
    </>
  );
}
