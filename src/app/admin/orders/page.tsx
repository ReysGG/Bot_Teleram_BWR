import Link from "next/link";
import { adminWebCustomerSelect, withAdminWebBuyer } from "@/server/admin/web-buyer";
import { ReceiptText, Search, UsersRound } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { orderSearchWhere, normalizeAdminSearch } from "@/server/admin/order-search";
import { adminPagination, parseAdminPage } from "@/server/admin/pagination";
import { prisma } from "@/server/db/prisma";
import { buyerLabel } from "@/server/orders/buyer";
import { orderStatusLabel } from "@/server/preorder/policy";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";
import { AdminOrderPaymentAction } from "@/components/admin/admin-order-payment-action";
import { buildAdminReturnPath } from "@/server/admin/return-path";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const query = await searchParams;
  const search = normalizeAdminSearch(query.q);
  const where = orderSearchWhere(search);
  const [counts, totalItems, uniqueBuyers] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      distinct: ["chatId"],
      select: { chatId: true },
    }),
  ]);
  const pagination = adminPagination(totalItems, parseAdminPage(query.page), 20);
  const now = new Date();
  const orderReturnTo = buildAdminReturnPath({
    pathname: "/admin/orders",
    query: {
      page: pagination.page > 1 ? pagination.page : undefined,
      q: search || undefined,
    },
    fragment: "order-list",
  });
  const orderRecords = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      payment: true,
      webCustomer: adminWebCustomerSelect,
      items: { orderBy: { createdAt: "asc" }, take: 1 },
      _count: { select: { items: true } },
    },
    skip: pagination.skip,
    take: pagination.take,
  });

  const orders = await Promise.all(orderRecords.map(withAdminWebBuyer));
  return (
    <AdminShell
      active="orders"
      counts={counts}
      description="Klik order untuk melihat identitas Telegram, pembayaran, delivery, dan memilih stok untuk preorder."
      email={admin.email}
      eyebrow="Buyer directory"
      title="Pembeli & order"
    >
      {query.notice === "payment-confirmed" ? (
        <AdminResultModal message="Pembayaran dikonfirmasi. Stok dan pengiriman sedang diproses." tone="success" />
      ) : null}
      {query.notice === "expired-payment-credited" ? (
        <AdminResultModal message="Pembayaran expired dimasukkan ke wallet tanpa mengirim produk." tone="success" />
      ) : null}
      {query.error ? (
        <AdminResultModal message={query.error === "payment_expired"
            ? "Invoice sudah melewati batas pembayaran. Tunggu status expired lalu gunakan Add Wallet."
            : query.error === "provider_recheck_required"
              ? "Pembayaran ini wajib diperiksa melalui verifier provider."
              : "Pembayaran tidak dapat diproses dari status saat ini."} tone="error" />
      ) : null}
      <section className="metric-grid">
        <article className="metric-card accent-orange">
          <div className="metric-card-title">
            <span>Total order ditemukan</span>
            <ReceiptText aria-hidden="true" />
          </div>
          <strong>{totalItems}</strong>
        </article>
        <article className="metric-card accent-green">
          <div className="metric-card-title">
            <span>Pembeli unik</span>
            <UsersRound aria-hidden="true" />
          </div>
          <strong>{uniqueBuyers.length}</strong>
        </article>
      </section>

      <section className="panel wide-panel" id="order-list">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Purchase history</p>
            <h2>Semua pembelian terbaru</h2>
          </div>
          <form action="/admin/orders#order-list" className="admin-search-form" method="get">
            <label className="visually-hidden" htmlFor="order-search">
              Cari username atau order
            </label>
            <input
              defaultValue={search}
              id="order-search"
              name="q"
              placeholder="Cari @username, nama, invoice, produk..."
              type="search"
            />
            <button className="button button-small" type="submit">
              <Search aria-hidden="true" size={16} />
              Cari
            </button>
            {search ? (
              <Link className="button button-small button-ghost" href="/admin/orders" prefetch={false}>
                Reset
              </Link>
            ) : null}
          </form>
        </div>
        {orders.length === 0 ? (
          <div className="empty-state">
            <strong>Belum ada pembelian.</strong>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Pembeli</th>
                  <th>Invoice</th>
                  <th>Produk</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Waktu</th>
                  <th>Aksi pembayaran</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <strong>{buyerLabel(order)}</strong>
                      <small>{order.channel === "WEB" ? "Website" : `Chat ${order.chatId}`}</small>
                    </td>
                    <td>{order.invoiceNumber}</td>
                    <td>
                      {order.items[0]?.productNameSnapshot ?? "-"}
                      <small>{order._count.items} akun</small>
                    </td>
                    <td>{formatRupiah(order.grandTotal)}</td>
                    <td>{orderStatusLabel(order.status)}</td>
                    <td>
                      {order.createdAt.toLocaleString("id-ID", {
                        timeZone: "Asia/Jakarta",
                      })}
                    </td>
                    <td>
                      <AdminOrderPaymentAction
                        now={now}
                        order={order}
                        returnTo={orderReturnTo}
                      />
                    </td>
                    <td>
                      <Link className="button button-small" href={`/admin/orders/${order.id}`} prefetch={false}>
                        Buka detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <AdminPagination
          ariaLabel="Pagination order"
          basePath="/admin/orders"
          currentPage={pagination.page}
          fragment="order-list"
          itemLabel="order"
          pageSize={pagination.pageSize}
          query={{ q: search || undefined }}
          totalItems={pagination.totalItems}
        />
      </section>
    </AdminShell>
  );
}
