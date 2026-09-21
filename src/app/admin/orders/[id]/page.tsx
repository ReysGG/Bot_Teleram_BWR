import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { FulfillmentTracking } from "@/components/admin/orders/fulfillment-tracking";
import { ManualFulfillment } from "@/components/admin/orders/manual-fulfillment";
import { NotificationHistory } from "@/components/admin/orders/notification-history";
import { OrderMetrics } from "@/components/admin/orders/order-metrics";
import { OrderNotices } from "@/components/admin/orders/order-notices";
import { OrderOverview } from "@/components/admin/orders/order-overview";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import {
  getAdminOrderDetailView,
  type AdminOrderDetailQuery,
} from "@/server/admin/orders/detail";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<AdminOrderDetailQuery>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query, counts] = await Promise.all([
    params,
    searchParams,
    getAdminInventoryCounts(),
  ]);
  const view = await getAdminOrderDetailView(id, query);
  if (!view) notFound();

  return (
    <AdminShell
      active="orders"
      counts={counts}
      description="Audit identitas pembeli, status pembayaran, antrean Telegram, dan alokasi file untuk order ini."
      email={admin.email}
      eyebrow="Order detail"
      title={view.order.invoiceNumber}
    >
      <OrderNotices query={query} />
      <OrderMetrics order={view.order} />
      <FulfillmentTracking
        buyerDeliveryFeedback={view.buyerDeliveryFeedback}
        deliverySummary={view.deliverySummary}
        order={view.order}
        revealSensitive={query.reveal === "1"}
      />
      <OrderOverview
        canCancelPreorder={view.canCancelPreorder}
        order={view.order}
        wallet={view.wallet}
      />
      {view.canAssignOrder ? (
        <ManualFulfillment
          assignedUnits={view.assignedUnits}
          availableStockCount={view.availableStockCount}
          nextUnassignedItem={view.nextUnassignedItem}
          notificationStatus={view.notificationStatus}
          order={view.order}
          query={query}
          remainingUnits={view.remainingUnits}
          stockItems={view.stockItems}
          stockPagination={view.stockPagination}
        />
      ) : null}
      <NotificationHistory
        notificationPagination={view.notificationPagination}
        notifications={view.notifications}
        notificationStatus={view.notificationStatus}
        order={view.order}
        query={query}
      />
    </AdminShell>
  );
}
