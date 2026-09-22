import { readStockQuotaSnapshot } from "@/server/stock/quota";
import { InventoryActions } from "@/components/admin/inventory-actions";
import { InventoryAutoRefresh } from "@/components/admin/inventory-auto-refresh";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { booleanEnv, integerEnv } from "@/server/env";
import { InventoryFileLink } from "@/components/admin/inventory-file-link";
import { buildAdminReturnPath } from "@/server/admin/return-path";
import { Download } from "lucide-react";

export type AdminInventoryRow = {
  id: string;
  originalFilename: string;
  status: "AVAILABLE" | "RESERVED" | "DELIVERED" | "BANNED" | "DISABLED";
  healthStatus: "UNKNOWN" | "HEALTHY" | "BANNED" | "ERROR";
  healthHttpStatus: number | null;
  bannedSaleApprovedAt?: Date | null;
  quotaSnapshot: unknown;
  archivedAt: Date | null;
  lastCheckedAt: Date | null;
  reservedAt: Date | null;
  deliveredAt: Date | null;
  deliveredOrderId: string | null;
  product: { name: string };
  invoiceNumber?: string | null;
};

function dateLabel(value: Date | string | null): string {
  if (!value) return "Belum ada";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "Belum ada";
}

function healthTone(health: AdminInventoryRow["healthStatus"]): string {
  if (health === "HEALTHY") return "status-good";
  if (health === "BANNED") return "status-bad";
  if (health === "ERROR") return "status-warn";
  return "status-neutral";
}

function healthLabel(
  health: AdminInventoryRow["healthStatus"],
  httpStatus: number | null,
): string {
  if (health === "HEALTHY") return httpStatus ? "TERHUBUNG" : "SIAP";
  if (health === "BANNED") return "BANNED";
  if (health === "ERROR") return "CHECK ERROR";
  return "BELUM DICEK";
}

function resetLabel(value: string | null): string {
  if (!value) return "reset belum diketahui";
  return `reset ${new Date(value).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    dateStyle: "short",
    timeStyle: "short",
  })}`;
}

function quotaTone(remaining: number): string {
  if (remaining <= 10) return "quota-critical";
  if (remaining <= 35) return "quota-warning";
  return "quota-healthy";
}

export function InventoryTable({
  items,
  pagination,
  returnTo,
}: {
  items: AdminInventoryRow[];
  pagination: {
    basePath: string;
    currentPage: number;
    pageSize: number;
    query?: Record<string, string | undefined>;
    totalItems: number;
  };
  returnTo:
    | "/admin/inventory/available"
    | "/admin/inventory/sold"
    | "/admin/inventory/banned"
    | "/admin/inventory/banned-recovery"
    | "/admin/inventory/archived"
    | `/admin/products/${string}/stock`;
}) {
  const autoCheckEnabled = booleanEnv("STOCK_AUTO_CHECK_ENABLED", true);
  const intervalSeconds = Math.min(
    integerEnv("STOCK_AUTO_CHECK_INTERVAL_SECONDS", 30),
    24 * 60 * 60,
  );
  const hasBulkDeletableItems = items.some(
    (item) => item.status !== "RESERVED" && item.status !== "DELIVERED",
  );
  const hasBulkDownloadableItems = items.length > 0;
  const actionReturnTo = buildAdminReturnPath({
    pathname: returnTo,
    query: {
      ...pagination.query,
      page: pagination.currentPage > 1 ? pagination.currentPage : undefined,
    },
    fragment: "inventory-ledger",
  });
  const paginationWithFragment = {
    ...pagination,
    fragment: "inventory-ledger",
  };

  if (items.length === 0) {
    return (
      <div id="inventory-ledger">
        <InventoryAutoRefresh
          autoCheckEnabled={autoCheckEnabled}
          intervalSeconds={intervalSeconds}
        />
        <div className="empty-state">
          <strong>Belum ada data di bagian ini.</strong>
          <p>Data akan muncul otomatis ketika lifecycle atau health status stok berubah.</p>
        </div>
        <AdminPagination {...paginationWithFragment} />
      </div>
    );
  }

  return (
    <div id="inventory-ledger">
      <InventoryAutoRefresh
        autoCheckEnabled={autoCheckEnabled}
        intervalSeconds={intervalSeconds}
      />
      <div className="inventory-edit-toolbar">
        <span className="muted">Pilih maksimal 100 stok. Download tidak mengubah status; hapus hanya memproses stok yang aman.</span>
        <div className="inventory-bulk-actions">
          {hasBulkDownloadableItems ? (
            <button
              className="button button-small"
              form="bulk-inventory-delete"
              formAction="/api/admin/inventory/download"
              formMethod="post"
              type="submit"
            >
              <Download aria-hidden="true" size={15} />
              Download terpilih
            </button>
          ) : null}
          {hasBulkDeletableItems ? (
            <AdminConfirmSubmitButton
              className="button button-danger button-small"
              confirmText="Ya, hapus stok terpilih"
              description="Credential terenkripsi yang dihapus tidak dapat dipulihkan. Stok terjual dan direservasi otomatis dilewati."
              formId="bulk-inventory-delete"
              title="Hapus stok terpilih?"
            >
              Hapus terpilih
            </AdminConfirmSubmitButton>
          ) : null}
        </div>
      </div>
      <form action="/api/admin/inventory/delete" id="bulk-inventory-delete" method="post">
        <input name="returnTo" type="hidden" value={actionReturnTo} />
      </form>
      <div className="table-wrap">
        <table className="inventory-table" data-sort-mode="server">
        <thead>
          <tr>
            <th>Pilih</th>
            <th>Akun/file</th>
            <th>Produk</th>
            <th>Lifecycle</th>
            <th>Kesehatan</th>
            <th>Quota</th>
            <th>Aktivitas stok</th>
            <th>Referensi</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const quota = readStockQuotaSnapshot(item.quotaSnapshot);
            return (
              <tr key={item.id}>
                <td>
                  <input
                    aria-label={`Pilih ${item.originalFilename}`}
                    form="bulk-inventory-delete"
                    name="stockItemIds"
                    type="checkbox"
                    value={item.id}
                  />
                </td>
                <td>
                  <InventoryFileLink id={item.id} filename={item.originalFilename} returnTo={actionReturnTo} />
                  <small>ID {item.id.slice(-8)}</small>
                </td>
                <td>{item.product.name}</td>
                <td>
                  <span className="status-pill status-neutral">{item.status}</span>
                </td>
                <td>
                  <span className={`status-pill ${healthTone(item.healthStatus)}`}>
                    {healthLabel(item.healthStatus, item.healthHttpStatus)}
                  </span>
                  <small>
                    {item.healthHttpStatus ? `HTTP ${item.healthHttpStatus} - ` : ""}
                    {item.lastCheckedAt
                      ? `dicek ${dateLabel(item.lastCheckedAt)}`
                      : "belum pernah dicek"}
                  </small>
                  {item.bannedSaleApprovedAt ? (
                    <small><strong>Izin jual owner aktif</strong></small>
                  ) : null}
                </td>
                <td className="quota-cell">
                  {quota ? (
                    <>
                      <strong>{quota.plan.toUpperCase()}</strong>
                      {quota.quotas.map((window) => (
                        <div
                          className={`quota-meter ${quotaTone(window.remaining)}`}
                          key={window.key}
                        >
                          <div className="quota-meter-heading">
                            <span>{window.label}</span>
                            <strong>{window.remaining}%</strong>
                          </div>
                          <div
                            aria-label={`${window.label}: ${window.remaining}% tersisa`}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={window.remaining}
                            className="quota-track"
                            role="progressbar"
                          >
                            <span style={{ width: `${window.remaining}%` }} />
                          </div>
                          <small>
                            {window.used}% terpakai - {resetLabel(window.resetAt)}
                          </small>
                        </div>
                      ))}
                      {quota.quotas.length === 0 ? (
                        <small>Quota aktif tanpa rincian window.</small>
                      ) : null}
                      <small className="quota-updated">
                        Quota diperbarui {dateLabel(quota.checkedAt)}
                      </small>
                    </>
                  ) : (
                    <span className="muted">Belum ada quota</span>
                  )}
                </td>
                <td>
                  <strong>
                    {item.status === "DELIVERED"
                      ? "Terkirim"
                      : item.status === "RESERVED"
                        ? "Direservasi"
                        : "Diperbarui"}
                  </strong>
                  <small>
                    {item.status === "DELIVERED"
                      ? dateLabel(item.deliveredAt)
                      : item.status === "RESERVED"
                        ? dateLabel(item.reservedAt)
                        : dateLabel(item.lastCheckedAt)}
                  </small>
                </td>
                <td>
                  {item.invoiceNumber ??
                    (item.deliveredOrderId
                      ? `Order ...${item.deliveredOrderId.slice(-8)}`
                      : "-")}
                </td>
                <td>
                  <InventoryActions
                    archived={Boolean(item.archivedAt)}
                    id={item.id}
                    returnTo={actionReturnTo}
                    status={item.status}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
      <AdminPagination {...paginationWithFragment} />
    </div>
  );
}
