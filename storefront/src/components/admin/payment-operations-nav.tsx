import Link from "next/link";

const items = [
  { key: "hub", href: "/admin/payments", label: "Ringkasan" },
  { key: "reconciliation", href: "/admin/payments/reconciliation", label: "Rekonsiliasi" },
  { key: "qris", href: "/admin/payments/qris", label: "QRIS" },
  { key: "jago", href: "/admin/payments/jago", label: "Bank Jago" },
  { key: "binance", href: "/admin/payments/binance", label: "Binance Pay" },
  { key: "usdt-bep20", href: "/admin/payments/usdt-bep20", label: "USDT BEP20" },
  { key: "shopee", href: "/admin/payments/shopee", label: "Shopee Partner" },
] as const;

export function PaymentOperationsNav({ active }: { active: (typeof items)[number]["key"] }) {
  return (
    <nav aria-label="Navigasi operasi pembayaran" className="admin-sheet-tabs">
      {items.map((item) => (
        <Link aria-current={active === item.key ? "page" : undefined} className={active === item.key ? "is-active" : ""} href={item.href} key={item.key} prefetch={false}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
