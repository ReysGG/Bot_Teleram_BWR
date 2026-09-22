import { PackageCheck, ReceiptText, UserRound } from "lucide-react";
import type { AdminOrderDetailOrder } from "@/server/admin/orders/detail";
import { buyerLabel } from "@/server/orders/buyer";
import { orderStatusLabel } from "@/server/preorder/policy";
import { formatRupiah } from "@/server/utils/format";

export function OrderMetrics({ order }: { order: AdminOrderDetailOrder }) {
  return (
    <section className="metric-grid">
      <article className="metric-card accent-orange">
        <div className="metric-card-title">
          <span>Status order</span>
          <ReceiptText aria-hidden="true" />
        </div>
        <strong>{orderStatusLabel(order.status)}</strong>
      </article>
      <article className="metric-card accent-green">
        <div className="metric-card-title">
          <span>Pembeli</span>
          <UserRound aria-hidden="true" />
        </div>
        <strong>{buyerLabel(order)}</strong>
      </article>
      <article className="metric-card accent-yellow">
        <div className="metric-card-title">
          <span>Total</span>
          <PackageCheck aria-hidden="true" />
        </div>
        <strong>{formatRupiah(order.grandTotal)}</strong>
      </article>
    </section>
  );
}
