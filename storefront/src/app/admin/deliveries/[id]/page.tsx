import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileCheck2,
  MessageCircleMore,
  PackageCheck,
  UserRound,
} from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { getAdminInventoryCounts } from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { buyerLabel } from "@/server/orders/buyer";
import { requireAdminPage } from "@/server/security/admin-auth";

export const dynamic = "force-dynamic";

function dateLabel(value: Date | null) {
  return value
    ? value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "-";
}

function deliveryStatusLabel(status: "READY" | "SENDING" | "SENT" | "FAILED" | "UNKNOWN") {
  if (status === "READY") return "Siap diambil lewat website";
  if (status === "SENT") return "Upload diterima Telegram";
  if (status === "SENDING") return "Sedang dikirim";
  if (status === "FAILED") return "Gagal";
  return "Perlu review";
}

export default async function DeliveryDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query, counts] = await Promise.all([params, searchParams, getAdminInventoryCounts()]);
  const delivery = await prisma.sentDelivery.findUnique({
    where: { id },
    include: {
      order: {
        include: {
          payment: true,
          items: { select: { stockItemId: true } },
          walletTransactions: {
            where: { type: "DELIVERY_REFUND" },
            select: { id: true },
            take: 1,
          },
        },
      },
      stockItem: { include: { product: true } },
    },
  });
  if (!delivery) notFound();
  const [notification, ambiguousDelivery, buyerFeedback] = await Promise.all([
    prisma.telegramNotification.findUnique({ where: { dedupeKey: delivery.dedupeKey } }),
    prisma.sentDelivery.findFirst({
      where: { orderId: delivery.orderId, status: { in: ["SENDING", "UNKNOWN"] } },
      select: { id: true },
    }),
    prisma.telegramNotification.findMany({
      where: {
        orderId: delivery.orderId,
        kind: { in: ["DELIVERY_ACKNOWLEDGED", "DELIVERY_MISSING_REPORT"] },
      },
      orderBy: { updatedAt: "desc" },
      select: { kind: true, status: true, updatedAt: true, messageText: true },
    }),
  ]);
  const canRetry =
    delivery.channel === "TELEGRAM" &&
    delivery.status === "FAILED" &&
    ["FAILED", "PENDING"].includes(notification?.status ?? "") &&
    !delivery.order.refundedAt &&
    delivery.order.walletTransactions.length === 0 &&
    !["REFUNDED", "CANCELLED", "COMPLETED"].includes(delivery.order.status) &&
    !ambiguousDelivery &&
    delivery.stockItem.status === "RESERVED" &&
    delivery.stockItem.reservedOrderId === delivery.orderId &&
    delivery.order.items.some((item) => item.stockItemId === delivery.stockItemId);

  return (
    <AdminShell
      active="deliveries"
      counts={counts}
      description="Lihat file yang dialokasikan, penerima Telegram, dan bukti pengiriman untuk satu unit produk."
      email={admin.email}
      eyebrow="Delivery evidence"
      title="Detail kiriman"
    >
      {query.notice === "retry-queued" ? (
        <AdminResultModal message="Pengiriman gagal dimasukkan kembali ke antrean Telegram." tone="success" title="Retry dijadwalkan" />
      ) : null}
      {query.error === "retry-blocked" ? (
        <AdminResultModal message="Retry diblokir karena status tidak aman, order sudah direfund, atau hasil kiriman masih ambigu." tone="error" title="Tidak aman untuk retry" />
      ) : null}
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href="/admin/deliveries" prefetch={false}>
          <ArrowLeft aria-hidden="true" size={17} />
          Kembali ke tracking
        </Link>
        <span className="muted">Delivery ...{delivery.id.slice(-8)}</span>
      </div>

      <section className="metric-grid">
        <article className="metric-card accent-green">
          <div className="metric-card-title"><span>Status</span><PackageCheck aria-hidden="true" /></div>
          <strong>{deliveryStatusLabel(delivery.status)}</strong>
        </article>
        <article className="metric-card accent-orange">
          <div className="metric-card-title"><span>Produk</span><FileCheck2 aria-hidden="true" /></div>
          <strong>{delivery.stockItem.product.name}</strong>
        </article>
        <article className="metric-card accent-yellow">
          <div className="metric-card-title"><span>Penerima</span><UserRound aria-hidden="true" /></div>
          <strong>{buyerLabel(delivery.order)}</strong>
        </article>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Allocated file</p>
            <h2>File yang dikirim</h2>
          </div>
          <a className="button button-primary" href={`/api/admin/deliveries/${delivery.id}/file`}>
            <Download aria-hidden="true" size={18} />
            Download salinan file
          </a>
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th>Nama file asli</th><td><strong>{delivery.stockItem.originalFilename}</strong></td></tr>
              <tr><th>Produk</th><td>{delivery.stockItem.product.name}</td></tr>
              <tr><th>ID stok</th><td>{delivery.stockItemId}</td></tr>
              <tr><th>Status stok</th><td>{delivery.stockItem.status}</td></tr>
              <tr><th>Kesehatan terakhir</th><td>{delivery.stockItem.healthStatus}</td></tr>
              <tr><th>Dialokasikan</th><td>{dateLabel(delivery.stockItem.reservedAt)}</td></tr>
              <tr><th>Ditandai terkirim</th><td>{dateLabel(delivery.stockItem.deliveredAt)}</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Recipient & receipt</p>
            <h2>Bukti pengiriman Telegram</h2>
          </div>
          <MessageCircleMore aria-hidden="true" size={28} />
        </div>
        <div className="table-wrap">
          <table>
            <tbody>
              <tr><th>Pembeli</th><td>{buyerLabel(delivery.order)}</td></tr>
              <tr><th>Channel</th><td>{delivery.channel === "WEB" ? "Website" : "Telegram"}</td></tr>
              <tr><th>Identitas channel</th><td>{delivery.chatId}</td></tr>
              <tr><th>Invoice</th><td>{delivery.order.invoiceNumber}</td></tr>
              <tr><th>Telegram message ID</th><td>{delivery.channel === "TELEGRAM" ? delivery.telegramMessageId ?? "-" : "Tidak digunakan"}</td></tr>
              {delivery.channel === "WEB" ? <tr><th>Download</th><td>{delivery.downloadCount} kali · terakhir {dateLabel(delivery.lastDownloadedAt)}</td></tr> : null}
              <tr><th>Status receipt</th><td>{deliveryStatusLabel(delivery.status)}</td></tr>
              <tr><th>Waktu API Telegram menerima upload</th><td>{dateLabel(delivery.sentAt)}</td></tr>
              <tr><th>Dibuat</th><td>{dateLabel(delivery.createdAt)}</td></tr>
              <tr><th>Error terakhir</th><td>{delivery.lastError ?? "-"}</td></tr>
              <tr>
                <th>Konfirmasi pembeli</th>
                <td>
                  {buyerFeedback.find((item) => item.kind === "DELIVERY_MISSING_REPORT" && item.status === "MANUAL_REVIEW")
                    ? "Pembeli melaporkan file tidak terlihat - review manual, jangan resend otomatis."
                    : buyerFeedback.find((item) => item.kind === "DELIVERY_ACKNOWLEDGED" && item.status === "SENT")
                      ? "Pembeli mengonfirmasi file sudah diterima."
                      : "Belum ada respons pembeli."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="inventory-edit-actions">
          <Link className="button button-ghost" href={`/admin/orders/${delivery.orderId}`} prefetch={false}>
            Buka order terkait
          </Link>
          {canRetry ? (
            <form action={`/api/admin/deliveries/${delivery.id}/retry`} method="post">
              <AdminConfirmSubmitButton
                className="button button-primary"
                confirmText="Ya, coba kirim lagi"
                description="Retry hanya dilakukan karena Telegram sebelumnya memberi hasil gagal yang pasti."
                title="Kirim ulang file ini?"
              >
                Coba kirim lagi
              </AdminConfirmSubmitButton>
            </form>
          ) : delivery.status === "FAILED" || delivery.status === "UNKNOWN" ? (
            delivery.status === "UNKNOWN" ? (
              <form action={`/api/admin/deliveries/${delivery.id}/retry`} method="post">
                <input type="hidden" name="confirmUnknown" value="true" />
                <AdminConfirmSubmitButton className="button button-primary" confirmText="Ya, pembeli memastikan file belum diterima" description={`Telegram sebelumnya memberi hasil ambigu. Pastikan pembeli belum menerima file sebelum mengizinkan satu kali retry. File yang sama: ${delivery.stockItem.originalFilename} · stok ${delivery.stockItemId.slice(-8)}.`} title="Konfirmasi file belum diterima?">Konfirmasi belum diterima &amp; retry</AdminConfirmSubmitButton>
              </form>
            ) : <span className="muted">Retry otomatis tidak tersedia karena perlu pemeriksaan manual.</span>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
