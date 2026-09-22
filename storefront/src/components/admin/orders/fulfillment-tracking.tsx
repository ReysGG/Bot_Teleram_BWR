import { Download, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { maskInventoryFilename } from "@/server/admin/inventory";
import {
  adminInlineStockContent,
  MAX_ADMIN_INLINE_ORDER_BYTES,
  MAX_ADMIN_INLINE_STOCK_BYTES,
  type AdminInlineStockContent,
} from "@/server/admin/orders/inline-stock-content";
import type { AdminOrderDetailView } from "@/server/admin/orders/detail";
import {
  deliveryReceiptStatusLabel,
  orderDetailDateLabel,
} from "@/components/admin/orders/labels";

type FulfillmentTrackingProps = Pick<
  AdminOrderDetailView,
  "order" | "deliverySummary" | "buyerDeliveryFeedback"
> & { revealSensitive: boolean };

export function FulfillmentTracking({
  order,
  deliverySummary,
  buyerDeliveryFeedback,
  revealSensitive,
}: FulfillmentTrackingProps) {
  const deliveryReceiptByStockId = new Map(
    order.deliveryReceipts.map((receipt) => [receipt.stockItemId, receipt]),
  );
  const downloadableFileCount = order.items.filter((item) =>
    item.stockItemId &&
    item.stockItem?.status === "DELIVERED" &&
    item.stockItem.deliveredOrderId === order.id &&
    order.deliveryReceipts.some(
      (receipt) =>
        receipt.stockItemId === item.stockItemId && receipt.status === "SENT",
    ),
  ).length;
  const inlineContentByStockId = revealSensitive ? order.items.reduce(
    (state, item) => {
      if (!item.stockItemId || item.stockItem?.status !== "DELIVERED") return state;
      const receipt = deliveryReceiptByStockId.get(item.stockItemId);
      if (receipt?.status !== "SENT") return state;
      const content = adminInlineStockContent(
        item.stockItem,
        Math.min(MAX_ADMIN_INLINE_STOCK_BYTES, state.remainingBytes),
      );
      return {
        remainingBytes:
          content.kind === "text"
            ? state.remainingBytes - content.byteLength
            : state.remainingBytes,
        contents: { ...state.contents, [item.stockItemId]: content },
      };
    },
    {
      remainingBytes: MAX_ADMIN_INLINE_ORDER_BYTES,
      contents: {} as Record<string, AdminInlineStockContent>,
    },
  ).contents : {};

  return (
    <section className="panel wide-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fulfillment tracking</p>
          <h2>Produk &amp; file yang dikirim</h2>
        </div>
        <div className="fulfillment-heading-actions">
          <span className="muted">
            {deliverySummary.sent} terkirim · {deliverySummary.processing} diproses · {deliverySummary.attention} perlu perhatian · {deliverySummary.waiting} menunggu.
          </span>
          {downloadableFileCount > 0 ? (
            <>
              <Link
                className="button button-small button-ghost"
                href={revealSensitive ? `/admin/orders/${order.id}` : `/admin/orders/${order.id}?reveal=1`}
                prefetch={false}
              >
                {revealSensitive ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}
                {revealSensitive ? "Sembunyikan isi" : "Tampilkan isi akun"}
              </Link>
              <a
                className="button button-small"
                href={`/api/admin/orders/${order.id}/files`}
              >
                <Download aria-hidden="true" size={16} />
                Download semua ({downloadableFileCount})
              </a>
            </>
          ) : null}
        </div>
      </div>
      {deliverySummary.sent > 0 ? (
        <p className={buyerDeliveryFeedback.missingReported ? "alert alert-error" : "alert alert-success"}>
          {buyerDeliveryFeedback.missingReported
            ? "Pembeli melaporkan file tidak terlihat. Jangan resend otomatis; buka detail kiriman dan cocokkan message ID."
            : buyerDeliveryFeedback.acknowledged
              ? "Pembeli sudah mengonfirmasi file terlihat."
              : "API Telegram menerima upload, tetapi pembeli belum mengonfirmasi file terlihat."}
        </p>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Produk</th>
              <th>File stock</th>
              <th>Lifecycle</th>
              <th>Pengiriman</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, index) => {
              const receipt = item.stockItemId
                ? deliveryReceiptByStockId.get(item.stockItemId)
                : undefined;
              const inlineContent = item.stockItemId
                ? inlineContentByStockId[item.stockItemId] ?? null
                : null;
              return (
                <tr key={item.id}>
                  <td>#{index + 1}</td>
                  <td><strong>{item.productNameSnapshot}</strong></td>
                  <td className="delivery-stock-cell">
                    {item.stockItem ? (
                      <>
                        <div className="delivery-stock-heading">
                          <div>
                            <strong>{maskInventoryFilename(item.stockItem.originalFilename)}</strong>
                            <small>ID {item.stockItem.id.slice(-8)}</small>
                          </div>
                          {inlineContent?.kind === "text" ? (
                            <span className="status-pill status-neutral">Isi akun</span>
                          ) : null}
                        </div>
                        {!revealSensitive ? (
                          <small className="delivery-inline-fallback">
                            Isi akun disembunyikan. Gunakan tombol Tampilkan isi akun jika memang diperlukan.
                          </small>
                        ) : inlineContent?.kind === "text" ? (
                          <pre className="delivery-inline-content">{inlineContent.text}</pre>
                        ) : inlineContent?.kind === "binary" ? (
                          <small className="delivery-inline-fallback">
                            TXT tidak dapat dibaca sebagai teks UTF-8. Gunakan detail kiriman.
                          </small>
                        ) : inlineContent?.kind === "too-large" ? (
                          <small className="delivery-inline-fallback">
                            Isi TXT terlalu besar untuk preview langsung. Gunakan detail kiriman.
                          </small>
                        ) : inlineContent?.kind === "unsupported" ? (
                          <small className="delivery-inline-fallback">
                            Preview langsung tersedia untuk file TXT yang sudah terkirim.
                          </small>
                        ) : inlineContent?.kind === "unavailable" ? (
                          <small className="delivery-inline-fallback">
                            Isi file tidak dapat dibuka. Periksa encryption key server.
                          </small>
                        ) : (
                          <small className="delivery-inline-fallback">
                            Isi akun tampil setelah upload diterima Telegram.
                          </small>
                        )}
                      </>
                    ) : (
                      <span className="muted">Belum dipilih</span>
                    )}
                  </td>
                  <td>{item.stockItem?.status ?? "WAITING_STOCK"}</td>
                  <td>
                    {receipt ? (
                      <>
                        <strong>{deliveryReceiptStatusLabel(receipt.status)}</strong>
                        <small>{orderDetailDateLabel(receipt.sentAt)}</small>
                      </>
                    ) : (
                      <span className="muted">Belum dikirim</span>
                    )}
                  </td>
                  <td>
                    {receipt ? (
                      <Link className="button button-small button-ghost" href={`/admin/deliveries/${receipt.id}`} prefetch={false}>
                        Detail kiriman
                      </Link>
                    ) : item.stockItem ? (
                      <Link className="button button-small button-ghost" href={`/admin/inventory/${item.stockItem.id}/edit?returnTo=${encodeURIComponent(`/admin/orders/${order.id}`)}`} prefetch={false}>
                        Buka stok
                      </Link>
                    ) : (
                      <span className="muted">Belum tersedia</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
