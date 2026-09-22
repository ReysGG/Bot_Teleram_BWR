import Link from "next/link";
import { ArrowLeft, Download, Eye, EyeOff, FileKey2, PackageCheck, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import {
  getAdminInventoryCounts,
  normalizeInventoryReturnUrl,
} from "@/server/admin/inventory";
import { prisma } from "@/server/db/prisma";
import { requireAdminPage } from "@/server/security/admin-auth";
import {
  canEditStockItem,
  decodeStockText,
  decryptStockFile,
} from "@/server/stock/inventory";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function dateLabel(value: Date | null) {
  return value?.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) ?? "-";
}

function displayText(filename: string, content: Buffer) {
  const decoded = decodeStockText(content);
  if (decoded === null) return null;
  if (/\.json$/i.test(filename)) {
    try {
      return JSON.stringify(JSON.parse(decoded), null, 2);
    } catch {
      return decoded;
    }
  }
  return decoded;
}

export default async function InventoryFilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; reveal?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query, counts] = await Promise.all([
    params,
    searchParams,
    getAdminInventoryCounts(),
  ]);
  const item = await prisma.digitalStockItem.findUnique({
    where: { id },
    include: {
      product: { select: { id: true, name: true } },
      orderItem: { include: { order: { select: { id: true, invoiceNumber: true } } } },
      deliveryReceipt: { select: { id: true, status: true } },
    },
  });
  if (!item) notFound();

  const fallback = item.archivedAt
    ? "/admin/inventory/archived"
    : item.status === "DELIVERED"
      ? "/admin/inventory/sold"
      : item.status === "BANNED" || item.healthStatus === "BANNED"
        ? "/admin/inventory/banned"
        : "/admin/inventory/available";
  const returnTo = normalizeInventoryReturnUrl(query.returnTo ?? "", fallback);
  const editable = canEditStockItem({
    status: item.status,
    reservedOrderId: item.reservedOrderId,
    deliveredOrderId: item.deliveredOrderId,
    hasOrderItem: Boolean(item.orderItem),
    hasDeliveryReceipt: Boolean(item.deliveryReceipt),
  });
  let text: string | null = null;
  let binaryContent = false;
  const revealSensitive = query.reveal === "1";
  if (revealSensitive) {
    try {
      const content = decryptStockFile(item);
      try {
        text = displayText(item.originalFilename, content);
        binaryContent = text === null;
      } finally {
        content.fill(0);
      }
    } catch {
      binaryContent = false;
    }
  }

  return (
    <AdminShell
      active={returnTo.includes("/products/") ? "products" : item.archivedAt ? "archived" : item.status === "DELIVERED" ? "sold" : item.healthStatus === "BANNED" ? "banned" : "available"}
      counts={counts}
      description="Buka isi credential terenkripsi dan seluruh referensi stok dari satu halaman admin."
      email={admin.email}
      eyebrow="Inventory file"
      title="Detail file stok"
    >
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href={returnTo} prefetch={false}><ArrowLeft aria-hidden="true" size={17} /> Kembali</Link>
        <span className="muted">ID stok {item.id}</span>
      </div>

      <section className="metric-grid">
        <article className="metric-card accent-orange"><div className="metric-card-title"><span>Produk</span><FileKey2 aria-hidden="true" /></div><strong>{item.product.name}</strong></article>
        <article className="metric-card accent-green"><div className="metric-card-title"><span>Lifecycle</span><PackageCheck aria-hidden="true" /></div><strong>{item.status}</strong></article>
        <article className="metric-card accent-yellow"><div className="metric-card-title"><span>Kesehatan</span><ShieldCheck aria-hidden="true" /></div><strong>{item.healthStatus}</strong></article>
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading">
          <div><p className="eyebrow">Decrypted content</p><h2>{item.originalFilename}</h2></div>
          <div className="product-row-actions">
            <Link
              className="button button-ghost"
              href={{
                pathname: `/admin/inventory/${item.id}`,
                query: revealSensitive
                  ? { returnTo }
                  : { returnTo, reveal: "1" },
              }}
              prefetch={false}
            >
              {revealSensitive ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
              {revealSensitive ? "Sembunyikan isi" : "Tampilkan isi credential"}
            </Link>
            <a className="button button-primary" href={`/api/admin/inventory/${item.id}/file`}><Download aria-hidden="true" size={17} /> Download file</a>
          </div>
        </div>
        {!revealSensitive ? (
          <p className="alert alert-success">
            Isi credential disembunyikan sampai admin memintanya agar tidak masuk ke prefetch atau cache navigasi browser.
          </p>
        ) : text !== null ? (
          <pre className="inventory-file-preview">{text}</pre>
        ) : binaryContent ? (
          <p className="alert alert-success">File ini berupa data biner. Gunakan tombol Download file untuk membukanya.</p>
        ) : (
          <p className="alert alert-error">Isi file tidak dapat didekripsi. Periksa encryption key server tanpa merotasinya.</p>
        )}
      </section>

      <section className="panel wide-panel">
        <div className="panel-heading"><div><p className="eyebrow">File references</p><h2>Metadata &amp; referensi</h2></div></div>
        <div className="table-wrap">
          <table><tbody>
            <tr><th>Nama file</th><td>{item.originalFilename}</td></tr>
            <tr><th>Produk</th><td>{item.product.name}</td></tr>
            <tr><th>Fingerprint</th><td className="credential-fingerprint">{item.credentialFingerprint}</td></tr>
            <tr><th>Lifecycle</th><td>{item.status}</td></tr>
            <tr><th>Kesehatan</th><td>{item.healthStatus}{item.healthHttpStatus ? ` / HTTP ${item.healthHttpStatus}` : ""}</td></tr>
            <tr><th>Dibuat</th><td>{dateLabel(item.createdAt)}</td></tr>
            <tr><th>Check terakhir</th><td>{dateLabel(item.lastCheckedAt)}</td></tr>
            <tr><th>Terkirim</th><td>{dateLabel(item.deliveredAt)}</td></tr>
            <tr><th>Diarsipkan</th><td>{dateLabel(item.archivedAt)}</td></tr>
            <tr><th>Order</th><td>{item.orderItem ? <Link href={`/admin/orders/${item.orderItem.order.id}`} prefetch={false}>{item.orderItem.order.invoiceNumber}</Link> : "-"}</td></tr>
            <tr><th>Bukti kiriman</th><td>{item.deliveryReceipt ? <Link href={`/admin/deliveries/${item.deliveryReceipt.id}`} prefetch={false}>Buka receipt ({item.deliveryReceipt.status})</Link> : "-"}</td></tr>
          </tbody></table>
        </div>
        <div className="inventory-edit-actions">
          {editable ? <Link className="button button-primary" href={{ pathname: `/admin/inventory/${item.id}/edit`, query: { returnTo } }} prefetch={false}>Edit file</Link> : null}
          {item.orderItem ? <Link className="button button-ghost" href={`/admin/orders/${item.orderItem.order.id}`} prefetch={false}>Buka order</Link> : null}
        </div>
      </section>
    </AdminShell>
  );
}
