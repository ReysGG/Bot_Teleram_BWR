import Link from "next/link";
import { Clock3, TimerReset } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { buyerLabel } from "@/server/orders/buyer";
import { orderStatusLabel } from "@/server/preorder/policy";
import { requireAdminPage } from "@/server/security/admin-auth";
import { formatRupiah } from "@/server/utils/format";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  if (!value) return "-";
  return value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

export default async function PreordersPage() {
  const admin = await requireAdminPage();
  const [counts, paidWaiting, pendingPayment] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.order.findMany({
      where: { isPreorder: true, status: "PAID_WAITING_STOCK" },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }],
      include: { items: { include: { product: true } } },
      take: 300,
    }),
    prisma.order.findMany({
      where: { isPreorder: true, status: "PENDING_PAYMENT" },
      orderBy: { expiresAt: "asc" },
      include: { items: { include: { product: true } } },
      take: 100,
    }),
  ]);

  return (
    <AdminShell
      active="preorders"
      counts={counts}
      description="Order lunas dialokasikan berdasarkan waktu pembayaran paling awal. Upload stok sehat akan membuat delivery otomatis tanpa perlu konfirmasi ulang."
      email={admin.email}
      eyebrow="FIFO fulfillment"
      title="Antrean preorder"
    >
      <section className="panel inventory-panel">
        <div className="panel-heading preorder-panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon">
              <Clock3 aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Paid queue</p>
              <h2>Lunas, menunggu stok</h2>
            </div>
          </div>
          <strong className="queue-count">{paidWaiting.length}</strong>
        </div>
        {paidWaiting.length === 0 ? (
          <div className="empty-state">
            <strong>Tidak ada preorder yang menunggu.</strong>
            <p>Order baru akan muncul setelah pembayaran preorder terkonfirmasi.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Urutan</th>
                  <th>Invoice</th>
                  <th>Produk</th>
                  <th>Jumlah</th>
                  <th>Pembeli</th>
                  <th>Total</th>
                  <th>Lunas sejak</th>
                  <th>Estimasi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paidWaiting.map((order, index) => (
                  <tr key={order.id}>
                    <td>
                      <span className="queue-position">#{index + 1}</span>
                    </td>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} prefetch={false}>
                        <strong>{order.invoiceNumber}</strong>
                      </Link>
                      <small>{orderStatusLabel(order.status)}</small>
                    </td>
                    <td>{order.items[0]?.productNameSnapshot ?? "-"}</td>
                    <td>{order.items.length} akun</td>
                    <td>{buyerLabel(order)}</td>
                    <td>{formatRupiah(order.grandTotal)}</td>
                    <td>{dateLabel(order.paidAt)}</td>
                    <td>{order.preorderEtaText ?? "-"}</td>
                    <td>
                      <Link className="button button-small" href={`/admin/orders/${order.id}`} prefetch={false}>
                        Kirim stok / cancel
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel wide-panel inventory-panel">
        <div className="panel-heading preorder-panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon">
              <TimerReset aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">Open invoices</p>
              <h2>Belum dibayar</h2>
            </div>
          </div>
          <strong className="queue-count">{pendingPayment.length}</strong>
        </div>
        {pendingPayment.length === 0 ? (
          <div className="empty-state">
            <strong>Tidak ada invoice preorder aktif.</strong>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Produk</th>
                  <th>Jumlah</th>
                  <th>Pembeli</th>
                  <th>Total</th>
                  <th>Kedaluwarsa</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayment.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/admin/orders/${order.id}`} prefetch={false}>
                        <strong>{order.invoiceNumber}</strong>
                      </Link>
                    </td>
                    <td>{order.items[0]?.productNameSnapshot ?? "-"}</td>
                    <td>{order.items.length} akun</td>
                    <td>{buyerLabel(order)}</td>
                    <td>{formatRupiah(order.grandTotal)}</td>
                    <td>{dateLabel(order.expiresAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
