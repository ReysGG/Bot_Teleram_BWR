import Link from "next/link";
import { CheckCircle2, LockKeyhole, RotateCcw } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { InventoryFileLink } from "@/components/admin/inventory-file-link";
import { buildAdminReturnPath } from "@/server/admin/return-path";

type BannedRecoveryItem = {
  id: string;
  originalFilename: string;
  status: string;
  healthHttpStatus: number | null;
  lastCheckedAt: Date | null;
  bannedSaleApprovedAt: Date | null;
  bannedSaleApprovedBy: string | null;
  bannedSaleApprovalNote: string | null;
  deliveredOrderId: string | null;
  reservedOrderId: string | null;
  product: {
    id: string;
    name: string;
    bannedStockPolicy: "BLOCKED" | "ALLOW_HTTP_401" | "OWNER_APPROVAL" | "RELOGIN_REQUIRED";
  };
  orderItem: { order: { invoiceNumber: string } } | null;
  deliveryReceipt: { id: string } | null;
};

function policyLabel(policy: BannedRecoveryItem["product"]["bannedStockPolicy"]) {
  if (policy === "ALLOW_HTTP_401") return "HTTP 401 otomatis dijual";
  if (policy === "OWNER_APPROVAL") return "Izin owner";
  if (policy === "RELOGIN_REQUIRED") return "Relogin wajib";
  return "Diblokir";
}

export function BannedRecoveryTable({
  items,
  pagination,
}: {
  items: BannedRecoveryItem[];
  pagination: {
    currentPage: number;
    pageSize: number;
    query: Record<string, string | undefined>;
    totalItems: number;
  };
}) {
  const returnTo = buildAdminReturnPath({
    pathname: "/admin/inventory/banned-recovery",
    query: {
      ...pagination.query,
      page: pagination.currentPage > 1 ? pagination.currentPage : undefined,
    },
    fragment: "inventory-ledger",
  });

  if (items.length === 0) {
    return <div className="empty-state" id="inventory-ledger"><strong>Tidak ada stok banned yang cocok.</strong></div>;
  }

  return (
    <div id="inventory-ledger">
      <div className="table-wrap">
        <table>
          <thead><tr><th>Akun/file</th><th>Produk</th><th>HTTP</th><th>Kepemilikan</th><th>Policy</th><th>Izin jual</th><th>Aksi</th></tr></thead>
          <tbody>
            {items.map((item) => {
              const referenced = Boolean(item.deliveredOrderId || item.reservedOrderId || item.orderItem || item.deliveryReceipt);
              const automaticHttp401 = item.healthHttpStatus === 401 &&
                item.product.bannedStockPolicy === "ALLOW_HTTP_401";
              const canApprove = !referenced && item.status === "BANNED" && item.product.bannedStockPolicy === "OWNER_APPROVAL";
              return (
                <tr key={item.id}>
                  <td><InventoryFileLink id={item.id} filename={item.originalFilename} returnTo={returnTo} /><small>ID {item.id.slice(-8)}</small></td>
                  <td><strong>{item.product.name}</strong><small>{policyLabel(item.product.bannedStockPolicy)}</small></td>
                  <td><span className="status-pill status-bad">HTTP {item.healthHttpStatus ?? "?"}</span><small>{item.lastCheckedAt?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "Belum dicek"}</small></td>
                  <td>{item.orderItem?.order.invoiceNumber ?? (item.deliveredOrderId ? `Order ...${item.deliveredOrderId.slice(-8)}` : item.reservedOrderId ? "Sedang direservasi" : "Belum pernah dijual")}</td>
                  <td>
                    <span className={`status-pill ${item.product.bannedStockPolicy === "ALLOW_HTTP_401" ? "status-good" : item.product.bannedStockPolicy === "OWNER_APPROVAL" ? "status-warn" : item.product.bannedStockPolicy === "RELOGIN_REQUIRED" ? "status-neutral" : "status-bad"}`}>{policyLabel(item.product.bannedStockPolicy)}</span>
                  </td>
                  <td>
                    {automaticHttp401 ? (
                      <><span className="status-pill status-good">Otomatis diizinkan</span><small>Khusus HTTP 401</small></>
                    ) : item.bannedSaleApprovedAt ? (
                      <><span className="status-pill status-good">Disetujui owner</span><small>{item.bannedSaleApprovedBy ?? "admin"}</small></>
                    ) : item.product.bannedStockPolicy === "ALLOW_HTTP_401" ? (
                      <span className="muted">HTTP 402 tetap diblokir</span>
                    ) : <span className="muted">Belum disetujui</span>}
                  </td>
                  <td>
                    <div className="action-cell">
                      {automaticHttp401 && !referenced ? (
                        <span className="status-pill status-good">Siap dijual otomatis</span>
                      ) : item.bannedSaleApprovedAt && !referenced ? (
                        <form action={`/api/admin/inventory/${item.id}/banned-sale`} method="post">
                          <input name="action" type="hidden" value="revoke" />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <AdminConfirmSubmitButton className="button button-small button-ghost" confirmText="Cabut izin" description="Stok kembali diblokir dan tidak dapat dipilih checkout." title="Cabut izin jual stok banned?"><RotateCcw aria-hidden="true" size={15} /> Cabut izin</AdminConfirmSubmitButton>
                        </form>
                      ) : canApprove ? (
                        <form action={`/api/admin/inventory/${item.id}/banned-sale`} method="post">
                          <input name="action" type="hidden" value="approve" />
                          <input name="note" type="hidden" value="Owner mengizinkan penjualan stok banned dari halaman recovery." />
                          <input name="returnTo" type="hidden" value={returnTo} />
                          <AdminConfirmSubmitButton className="button button-small button-primary" confirmText="Ya, izinkan jual" description="Credential tetap tercatat HTTP 401/402. Hanya stok ini yang dapat dipilih checkout, dan tanggung jawab berada pada owner." title="Izinkan stok banned ini dijual?"><CheckCircle2 aria-hidden="true" size={15} /> Izinkan jual</AdminConfirmSubmitButton>
                        </form>
                      ) : item.product.bannedStockPolicy === "RELOGIN_REQUIRED" && !referenced ? (
                        <Link className="button button-small" href={{ pathname: `/admin/inventory/${item.id}/edit`, query: { returnTo } }} prefetch={false}><LockKeyhole aria-hidden="true" size={15} /> Relogin / edit</Link>
                      ) : (
                        <span className="muted">{referenced ? "Riwayat dilindungi" : "Policy memblokir penjualan"}</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <AdminPagination ariaLabel="Pagination recovery stok banned" basePath="/admin/inventory/banned-recovery" currentPage={pagination.currentPage} fragment="inventory-ledger" itemLabel="stok banned" pageSize={pagination.pageSize} query={pagination.query} totalItems={pagination.totalItems} />
    </div>
  );
}
