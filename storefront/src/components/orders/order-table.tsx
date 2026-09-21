"use client";

import { ordersPageHref, type OrderPagination } from "@/lib/order-pagination";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import Image from "next/image";
import Link from "next/link";
import type { StorefrontOrderSummary } from "@/lib/store-api-contract";
import { formatRupiah } from "@/lib/catalog-types";

function statusLabel(order: StorefrontOrderSummary) {
  if (order.deliveryState === "READY") return "Siap diambil";
  if (order.deliveryState === "DELIVERED") return "Sudah diambil";
  if (order.deliveryState === "REFUNDED") return "Refund ke saldo";
  if (order.deliveryState === "CANCELLED") return "Dibatalkan";
  if (order.deliveryState === "EXPIRED") return "Kedaluwarsa";
  if (order.paymentStatus === "PAID") return "Sedang disiapkan";
  return "Menunggu pembayaran";
}

function statusTone(order: StorefrontOrderSummary) {
  if (["READY", "DELIVERED"].includes(order.deliveryState)) return "is-success";
  if (["REFUNDED", "EXPIRED", "CANCELLED"].includes(order.deliveryState)) return "is-muted";
  return "is-warning";
}

export function OrderTable({ orders, pagination }: { orders: StorefrontOrderSummary[]; pagination?: OrderPagination }) {
  const router = useRouter();
  const [filter, setFilter] = useState(pagination?.status ?? "all");
  const [query, setQuery] = useState(pagination?.q ?? "");
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const visible = pagination ? orders : orders.filter(order => {
    const matches = filter === "all" || (filter === "pending" && order.status === "PENDING_PAYMENT") || (filter === "success" && order.paymentStatus === "PAID" && !["REFUNDED", "CANCELLED", "EXPIRED"].includes(order.deliveryState)) || (filter === "expired" && (order.status === "EXPIRED" || order.deliveryState === "EXPIRED"));
    return matches && `${order.invoiceNumber} ${order.productName}`.toLocaleLowerCase("id-ID").includes(query.trim().toLocaleLowerCase("id-ID"));
  });
  async function copyInvoice(invoice: string) {
    try { await navigator.clipboard.writeText(invoice); setCopied(invoice); setCopyError(false); }
    catch { setCopyError(true); }
  }
  if (orders.length === 0 && !pagination) {
    return <div className="empty-catalog orders-empty"><Image src="/headings/orders-heading.png" alt="" width={270} height={180} sizes="270px" /><strong>Belum ada pesanan.</strong><span>Pesanan yang dibuat dengan email ini akan muncul di sini.</span><Link className="button button-primary" href="/shop">Mulai belanja</Link></div>;
  }
  return (
    <div className="order-history">
      <div className="order-history-toolbar"><div className="order-history-filters" role="group" aria-label="Filter status pesanan">{[["all", "Semua"], ["pending", "Menunggu pembayaran"], ["success", "Berhasil"], ["expired", "Kedaluwarsa"]].map(([value, label]) => <button type="button" key={value} className={filter === value ? "is-selected" : ""} aria-pressed={filter === value} onClick={() => { if (pagination) router.push(ordersPageHref({ q: query, status: value })); else setFilter(value); }}>{label}</button>)}</div><label className="order-history-search"><Icon name="search" size={17} aria-hidden="true" /><input aria-label="Cari invoice atau produk" placeholder="Cari invoice atau produk..." value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && pagination) router.push(ordersPageHref({ q: query, status: filter })); }} /></label>{pagination ? <button className="button button-quiet" onClick={() => router.push(ordersPageHref({ q: query, status: filter }))}>Cari</button> : null}</div>
      {copyError ? <p role="status">Invoice belum dapat disalin. Silakan salin nomor invoice yang ditampilkan.</p> : null}
      {visible.length === 0 ? <p className="order-search-empty" role="status">Tidak ada pesanan yang cocok dengan pencarian atau filter ini.</p> : <div className="orders-table-wrap">
      <table className="orders-table"><caption className="orders-table-caption">Riwayat pesanan dan status pengiriman produk</caption>
        <thead><tr><th>Produk</th><th>Invoice</th><th>Total</th><th>Status</th><th>File / Produk</th><th>Aksi</th></tr></thead>
        <tbody>
          {visible.map((order) => (
            <tr key={order.id}>
              <td data-label="Produk"><div className="order-product-cell"><span className="order-product-icon"><Icon name="cube" size={24} aria-hidden="true" /></span><div><strong>{order.productName}</strong><small>{new Date(order.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}</small></div></div></td>
              <td data-label="Invoice"><div className="order-invoice-cell"><code>{order.invoiceNumber}</code><button type="button" aria-label={`Salin invoice ${order.invoiceNumber}`} title="Salin invoice" onClick={() => void copyInvoice(order.invoiceNumber)}><Icon name={copied === order.invoiceNumber ? "check" : "copy"} size={15} aria-hidden="true" /></button></div></td>
              <td data-label="Total"><strong>{formatRupiah(order.billedAmount)}</strong><small>{order.quantity} item</small></td>
              <td data-label="Status"><span className={"order-status " + statusTone(order)}>{statusLabel(order)}</span></td>
              <td data-label="File">{order.readyFiles > 0 ? `${order.readyFiles} siap` : order.deliveredFiles > 0 ? `${order.deliveredFiles} diambil` : "Belum tersedia"}</td>
              <td className="orders-table-action"><Link className="order-detail-link" prefetch={false} href={"/orders/" + encodeURIComponent(order.invoiceNumber)}>Lihat detail <Icon name="arrow-right" size={15} aria-hidden="true" /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>}
      {pagination ? <nav className="orders-pagination" aria-label="Halaman pesanan">
        {pagination.page > 1 ? <Link prefetch={false} href={ordersPageHref({ ...pagination, page: pagination.page - 1 })}>Sebelumnya</Link> : <span />}
        <span>Halaman {pagination.page} dari {pagination.totalPages} | {pagination.total} pesanan</span>
        {pagination.page < pagination.totalPages ? <Link prefetch={false} href={ordersPageHref({ ...pagination, page: pagination.page + 1 })}>Berikutnya</Link> : <span />}
      </nav> : null}
    </div>
  );
}
