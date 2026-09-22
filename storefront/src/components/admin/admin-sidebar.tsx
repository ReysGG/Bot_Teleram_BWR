import { AdminNavigationLink } from "@/components/admin/admin-navigation-link";
import {
  Activity,
  Archive,
  ArchiveX,
  BadgeCheck,
  Boxes,
  ChartNoAxesCombined,
  Clock3,
  CreditCard,
  Gift,
  KeyRound,
  Layers3,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageCircle,
  MessageSquareText,
  PackageOpen,
  Send,
  Search,
  Settings2,
  ShieldBan,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { AdminInventoryCounts } from "@/server/admin/inventory";

export type AdminSection =
  | "overview"
  | "sellerProducts"
  | "reports"
  | "products"
  | "inactiveProducts"
  | "productGroups"
  | "orders"
  | "deliveries"
  | "broadcasts"
  | "smspool"
  | "wallet"
  | "referrals"
  | "redeem"
  | "preorders"
  | "available"
  | "contentSearch"
  | "sold"
  | "banned"
  | "bannedRecovery"
  | "archived"
  | "paymentSettings"
  | "payments"
  | "monitoring"
  | "telegram";

export function AdminSidebar({
  active,
  counts,
  email,
}: {
  active?: AdminSection;
  counts?: AdminInventoryCounts;
  email?: string;
}) {
  const links = [
    { key: "sellerProducts" as const, href: "/admin/seller-products/reviews", label: "Review produk seller", icon: BadgeCheck },
    { key: "overview" as const, href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    { key: "reports" as const, href: "/admin/reports", label: "Laporan penjualan", icon: ChartNoAxesCombined },
    { key: "paymentSettings" as const, href: "/admin/payment-settings", label: "Metode pembayaran", icon: Settings2 },
    { key: "payments" as const, href: "/admin/payments", label: "Operasi pembayaran", icon: CreditCard },
    { key: "monitoring" as const, href: "/admin/monitoring", label: "Monitoring sistem", icon: Activity },
    { key: "telegram" as const, href: "/admin/telegram", label: "Telegram UX", icon: MessageCircle },
    { key: "productGroups" as const, href: "/admin/product-groups", label: "Grup & varian", icon: Layers3 },
    { key: "products" as const, href: "/admin/products", label: "Produk", icon: Boxes },
    { key: "inactiveProducts" as const, href: "/admin/products/inactive", label: "Produk nonaktif", icon: ArchiveX },
    { key: "preorders" as const, href: "/admin/preorders", label: "Preorder", icon: Clock3, count: counts?.preorders },
    { key: "orders" as const, href: "/admin/orders", label: "Pembeli & order", icon: UsersRound },
    { key: "deliveries" as const, href: "/admin/deliveries", label: "Tracking kiriman", icon: Send },
    { key: "broadcasts" as const, href: "/admin/broadcasts", label: "Broadcast & win-back", icon: Megaphone },
    { key: "smspool" as const, href: "/admin/smspool", label: "SMSPool", icon: MessageSquareText },
    { key: "wallet" as const, href: "/admin/wallet", label: "Wallet & saldo", icon: WalletCards },
    { key: "referrals" as const, href: "/admin/referrals", label: "Referral", icon: Gift },
    { key: "redeem" as const, href: "/admin/redeem", label: "Codex Free Login Vault", icon: KeyRound },
    { key: "available" as const, href: "/admin/inventory/available", label: "Belum terjual", icon: PackageOpen, count: counts?.available },
    { key: "contentSearch" as const, href: "/admin/inventory/search", label: "Cari isi stok & pembeli", icon: Search },
    { key: "sold" as const, href: "/admin/inventory/sold", label: "Terjual", icon: BadgeCheck, count: counts?.sold },
    { key: "banned" as const, href: "/admin/inventory/banned", label: "Banned", icon: ShieldBan, count: counts?.banned },
    { key: "bannedRecovery" as const, href: "/admin/inventory/banned-recovery", label: "Recovery banned", icon: ShieldCheck },
    { key: "archived" as const, href: "/admin/inventory/archived", label: "Arsip", icon: Archive, count: counts?.archived },
  ];

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-brand">
        <span className="sidebar-mark">B</span>
        <div>
          <strong>BWR <em>TELE</em></strong>
          <small>Admin workspace</small>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Navigasi admin">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <AdminNavigationLink
              aria-current={active === link.key ? "page" : undefined}
              className={`sidebar-link${active === link.key ? " is-active" : ""}`}
              href={link.href}
              key={link.key}
            >
              <span className="sidebar-link-main">
                <Icon aria-hidden="true" size={17} strokeWidth={2.2} />
                <span>{link.label}</span>
              </span>
              {typeof link.count === "number" ? <b>{link.count}</b> : null}
            </AdminNavigationLink>
          );
        })}
      </nav>

      {email ? (
        <div className="sidebar-footer">
          <span title={email}>{email}</span>
          <form action="/api/admin/logout" method="post">
            <button className="button button-light sidebar-logout" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Keluar
            </button>
          </form>
        </div>
      ) : null}
    </aside>
  );
}
