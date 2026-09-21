import type { OrderPagination } from "@/lib/order-pagination";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { SupportCard } from "@/components/site/support-card";
import { OrderTable } from "@/components/orders/order-table";
import { formatRupiah } from "@/lib/catalog-types";
import type { StorefrontOrderSummary } from "@/lib/store-api-contract";
export function OrdersDashboard({ orders, customer, pagination }: { pagination?: OrderPagination; orders: StorefrontOrderSummary[]; customer: { contactMasked: string; walletBalance: number } }) {
  return <>          <div className="orders-summary-grid" aria-label="Ringkasan akun dan pesanan">
            <div><span className="orders-metric-icon"><Icon name="cube" size={25} aria-hidden="true" /></span><div><span>{pagination ? "Total pesanan" : "Pesanan ditampilkan"}</span><strong>{pagination?.totalOrders ?? orders.length}</strong><small>{customer.contactMasked}</small></div></div>
            <div><span className="orders-metric-icon is-amber"><Icon name="clock" size={25} aria-hidden="true" /></span><div><span>Menunggu pembayaran</span><strong>{pagination?.pendingCount ?? orders.filter(order => order.status === "PENDING_PAYMENT").length}</strong><small>{(pagination ? pagination.pendingCount > 0 : orders.some(order => order.status === "PENDING_PAYMENT")) ? "Periksa batas waktu di invoice" : "Tidak ada pembayaran tertunda"}</small></div></div>
            <Link href="/account/wallet"><span className="orders-metric-icon is-teal"><Icon name="wallet" size={25} aria-hidden="true" /></span><div><span>Saldo refund</span><strong>{formatRupiah(customer.walletBalance)}</strong><small className="orders-metric-link">Lihat riwayat saldo <Icon name="arrow-right" size={14} aria-hidden="true" /></small></div></Link>
          </div>
          <section className="orders-list-card">
            <div className="orders-list-heading"><div className="orders-heading-label"><span><Icon name="receipt" size={22} aria-hidden="true" /></span><div><h2>Daftar pesanan</h2><p>Lihat pembayaran, status, dan produk dari pesananmu.</p></div></div><Link className="orders-back-link" href="/shop">Kembali ke toko <Icon name="arrow-right" size={15} aria-hidden="true" /></Link></div>
            <OrderTable orders={orders} pagination={pagination} />
          </section>
          <SupportCard compact /></>;
}
