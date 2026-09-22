import type { ReactNode } from "react";
import Link from "next/link";
import { requireSellerShell } from "@/server/seller/access";
import "./seller.css";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const state = await requireSellerShell();
  return <div className="seller-surface"><aside className="seller-sidebar"><Link href="/seller" className="seller-brand">BWR TELE <small>SELLER</small></Link><nav aria-label="Navigasi seller"><Link href="/seller">Ringkasan</Link>{state.kind === "active" ? <><Link href="/seller/products">Produk saya</Link><Link href="/seller/sales">Penjualan</Link><Link href="/seller/balance">Saldo</Link><Link href="/seller/withdrawals">Penarikan</Link></> : null}</nav><p className="seller-access-note">Akses seller dikelola admin.</p></aside><main className="seller-main">{children}</main></div>;
}
