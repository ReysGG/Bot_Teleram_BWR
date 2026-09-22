import type { ReactNode } from "react";
import Link from "next/link";
import { requireSellerShell } from "@/server/seller/access";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { LocalPreviewProvider } from "@/components/auth/local-preview-context";
import "./seller.css";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const state = await requireSellerShell();
  return <LocalPreviewProvider><SiteHeader active="account" /><main className="seller-main"><nav className="seller-subnav" aria-label="Navigasi seller"><Link href="/seller">Ringkasan</Link>{state.kind === "active" ? <><Link href="/seller/products">Produk saya</Link><Link href="/seller/sales">Penjualan</Link><Link href="/seller/balance">Saldo</Link><Link href="/seller/withdrawals">Penarikan</Link></> : null}</nav>{children}</main><SiteFooter /></LocalPreviewProvider>;
}
