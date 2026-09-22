import Link from "next/link";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { maskInventoryFilename } from "@/server/admin/inventory";
import type {
  AdminOrderDetailQuery,
  AdminOrderDetailView,
} from "@/server/admin/orders/detail";
import { readStockQuotaSnapshot } from "@/server/stock/quota";

type ManualFulfillmentProps = Pick<
  AdminOrderDetailView,
  | "order"
  | "assignedUnits"
  | "remainingUnits"
  | "nextUnassignedItem"
  | "availableStockCount"
  | "stockPagination"
  | "stockItems"
  | "notificationStatus"
> & { query: AdminOrderDetailQuery };

export function ManualFulfillment({
  order,
  assignedUnits,
  remainingUnits,
  nextUnassignedItem,
  availableStockCount,
  stockPagination,
  stockItems,
  notificationStatus,
  query,
}: ManualFulfillmentProps) {
  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Manual fulfillment</p>
          <h2>Pilih stok {nextUnassignedItem?.productNameSnapshot}</h2>
          <small>{availableStockCount} stok sehat tersedia untuk produk ini.</small>
        </div>
        <span className="muted">
          {assignedUnits}/{order.items.length} file dipilih · tersisa {remainingUnits}.
          Pengiriman dimulai otomatis setelah seluruh unit lengkap.
        </span>
      </div>
      {stockItems.length === 0 ? (
        <div className="empty-state">
          <strong>Belum ada stok tersedia dan sehat untuk produk ini.</strong>
          <p>Stock produk lain dan stock yang tidak dapat dipilih disembunyikan.</p>
          {nextUnassignedItem ? (
            <Link className="button button-primary button-small" href={`/admin/products/${nextUnassignedItem.productId}/stock`} prefetch={false}>
              Upload stok produk ini
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Kesehatan</th>
                <th>Quota</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {stockItems.map((stock) => {
                const quota = readStockQuotaSnapshot(stock.quotaSnapshot);
                return (
                  <tr key={stock.id}>
                    <td>
                      <strong>{maskInventoryFilename(stock.originalFilename)}</strong>
                      <small>ID {stock.id.slice(-8)}</small>
                    </td>
                    <td><span className="status-pill status-neutral">{stock.healthStatus}</span></td>
                    <td>
                      {quota?.quotas.map((window) => `${window.label} ${window.remaining}%`).join(" · ") || "-"}
                    </td>
                    <td>
                      <form action={`/api/admin/orders/${order.id}/assign-stock`} method="post">
                        <input name="stockItemId" type="hidden" value={stock.id} />
                        <button className="button button-small" type="submit">
                          Pilih stok
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {stockItems.length > 0 ? (
        <AdminPagination
          ariaLabel="Pagination stok order"
          basePath={`/admin/orders/${order.id}`}
          currentPage={stockPagination.page}
          itemLabel="stock tersedia"
          pageParam="stockPage"
          pageSize={stockPagination.pageSize}
          query={{
            notifyPage: query.notifyPage,
            notifyStatus: notificationStatus || undefined,
          }}
          totalItems={stockPagination.totalItems}
        />
      ) : null}
    </section>
  );
}
