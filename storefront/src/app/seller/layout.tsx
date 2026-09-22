import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, BadgeCheck, LayoutDashboard, LogOut, Package, WalletCards } from "lucide-react";
import { requireSellerShell } from "@/server/seller/access";
import { LocalPreviewProvider } from "@/components/auth/local-preview-context";
import "./seller.css";

export const dynamic = "force-dynamic";

export default async function SellerLayout({ children }: { children: ReactNode }) {
  const state = await requireSellerShell();
  const sellerName = state.seller?.displayName ?? "Seller workspace";
  return <LocalPreviewProvider><div className="seller-management-shell"><aside className="seller-sidebar"><Link className="seller-sidebar-brand" href="/seller"><span className="seller-sidebar-mark">B</span><span><strong>BWR <em>TELE</em></strong><small>Seller workspace</small></span></Link><nav className="seller-sidebar-nav" aria-label="Navigasi seller"><Link href="/seller"><LayoutDashboard aria-hidden="true" size={17} />Ringkasan</Link><Link href="/seller/products"><Package aria-hidden="true" size={17} />Produk saya</Link><Link href="/seller/sales"><Activity aria-hidden="true" size={17} />Penjualan</Link><Link href="/seller/balance"><WalletCards aria-hidden="true" size={17} />Saldo</Link><Link href="/seller/withdrawals"><BadgeCheck aria-hidden="true" size={17} />Penarikan</Link></nav><div className="seller-sidebar-footer"><span>{sellerName}</span><Link href="/shop">Kembali ke toko</Link><Link href="/seller/login"><LogOut aria-hidden="true" size={16} />Keluar</Link></div></aside><div className="seller-workspace"><header className="seller-management-topbar"><strong>Portal seller</strong><span>Kelola produk, stok, penjualan, dan pencairan.</span><b>{sellerName}</b></header><main className="seller-main">{children}</main></div></div></LocalPreviewProvider>;
}
