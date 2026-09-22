import Link from "next/link";
import { ArrowLeft, FileText, LockKeyhole, Save } from "lucide-react";
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

type InventoryPath =
  | "/admin/inventory/available"
  | "/admin/inventory/sold"
  | "/admin/inventory/banned"
  | "/admin/inventory/banned-recovery"
  | "/admin/inventory/archived"
  | `/admin/products/${string}/stock`;

const errorMessages: Record<string, string> = {
  "stock-product-required": "Pilih produk untuk stok ini.",
  "stock-product-missing": "Produk yang dipilih sudah tidak tersedia.",
  "stock-empty": "Isi JSON tidak boleh kosong.",
  "stock-too-large": "Isi JSON melebihi batas 64 KB.",
  "stock-invalid-json": "Isi file tidak dapat dibaca.",
  "stock-invalid-credential":
    "Struktur JSON tidak dapat dibaca sebagai stok.",
  "stock-encryption-key": "Kunci enkripsi stok server tidak valid.",
  "stock-duplicate": "Credential tersebut sudah tersimpan pada stok lain.",
  "stock-not-editable": "Stok sudah dikunci, terjual, atau memiliki referensi order.",
  "stock-concurrent-update": "Stok berubah saat diedit. Muat ulang lalu coba kembali.",
  "stock-edit": "Perubahan stok gagal disimpan.",
};

function inventorySection(value: string) {
  const path = value.split(/[?#]/, 1)[0];
  if (path.endsWith("/sold")) return "sold" as const;
  if (path.endsWith("/banned") || path.endsWith("/banned-recovery")) return "banned" as const;
  if (path.endsWith("/archived")) return "archived" as const;
  if (path.includes("/products/")) return "products" as const;
  return "available" as const;
}

function formattedContent(rawContent: string): string {
  try {
    return JSON.stringify(JSON.parse(rawContent), null, 2);
  } catch {
    return rawContent;
  }
}

export default async function EditInventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const admin = await requireAdminPage();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [counts, item, products] = await Promise.all([
    getAdminInventoryCounts(),
    prisma.digitalStockItem.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        orderItem: { select: { id: true } },
        deliveryReceipt: { select: { id: true } },
      },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    }),
  ]);
  if (!item) notFound();

  const fallbackPath: InventoryPath = item.archivedAt
    ? "/admin/inventory/archived"
    : item.status === "BANNED" || item.healthStatus === "BANNED"
      ? "/admin/inventory/banned"
      : item.status === "DELIVERED"
        ? "/admin/inventory/sold"
        : "/admin/inventory/available";
  const returnTo = normalizeInventoryReturnUrl(
    query.returnTo ?? "",
    fallbackPath,
  );
  const editable = canEditStockItem({
    status: item.status,
    reservedOrderId: item.reservedOrderId,
    deliveredOrderId: item.deliveredOrderId,
    hasOrderItem: Boolean(item.orderItem),
    hasDeliveryReceipt: Boolean(item.deliveryReceipt),
  });
  const storedContent = editable ? decryptStockFile(item) : null;
  let editableText: string | null = null;
  if (storedContent) {
    try {
      editableText = decodeStockText(storedContent);
    } finally {
      storedContent.fill(0);
    }
  }

  return (
    <AdminShell
      active={inventorySection(returnTo)}
      counts={counts}
      description="Perbarui data stok tanpa menghapus dan meng-upload ulang. Credential disimpan kembali dalam keadaan terenkripsi."
      email={admin.email}
      eyebrow="Credential maintenance"
      title="Edit stok"
    >
      <div className="inventory-edit-toolbar">
        <Link className="button button-ghost" href={returnTo} prefetch={false}>
          <ArrowLeft aria-hidden="true" size={17} />
          Kembali
        </Link>
        <span className="muted">ID stok ...{item.id.slice(-8)}</span>
      </div>

      {query.error ? (
        <p className="alert alert-error">
          {errorMessages[query.error] ?? errorMessages["stock-edit"]}
        </p>
      ) : null}

      {!editable ? (
        <section className="panel inventory-edit-locked">
          <LockKeyhole aria-hidden="true" size={34} />
          <div>
            <h2>Stok ini dikunci</h2>
            <p>
              Stok berstatus {item.status} tidak boleh diubah karena sedang dicadangkan,
              sudah terkirim, atau terhubung ke riwayat order. Perlindungan ini mencegah
              pembeli menerima credential yang berbeda dari catatan transaksi.
            </p>
          </div>
        </section>
      ) : (
        <section className="panel inventory-edit-panel">
          <div className="panel-heading">
            <div className="panel-heading-title">
              <span className="panel-heading-icon">
                <FileText aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">{item.product.name}</p>
                <h2>Data file stok</h2>
              </div>
            </div>
            <div className="inventory-edit-statuses">
              <span className="status-pill status-neutral">{item.status}</span>
              <span className="status-pill status-neutral">{item.healthStatus}</span>
            </div>
          </div>

          <form
            action={`/api/admin/inventory/${item.id}/edit`}
            className="stack-form"
            encType="multipart/form-data"
            method="post"
          >
            <input name="returnTo" type="hidden" value={returnTo} />
            <div className="split-fields">
              <label>
                Produk
                <select name="productId" defaultValue={item.productId} required>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                      {product.status === "INACTIVE" ? " (nonaktif)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nama file pengiriman
                <input
                  autoComplete="off"
                  defaultValue={item.originalFilename}
                  maxLength={180}
                  name="filename"
                  required
                />
              </label>
            </div>

            {editableText === null ? (
              <p className="alert alert-success inventory-binary-notice">
                File ini bukan teks UTF-8. Isi biner tetap dipertahankan terenkripsi
                di server dan tidak dikirim ke browser; gunakan file pengganti jika
                ingin mengubah kontennya.
              </p>
            ) : (
              <label>
                Isi file
                <textarea
                  autoComplete="off"
                  className="credential-editor"
                  defaultValue={formattedContent(editableText)}
                  name="rawContent"
                  required
                  rows={22}
                  spellCheck={false}
                />
              </label>
            )}
            <label>
              Ganti dengan file baru (opsional)
              <input name="replacementFile" type="file" />
            </label>
            <p className="fine-print inventory-edit-warning">
              Menyimpan akan membuat fingerprint baru dan mengenkripsi ulang isi JSON.
              Format K12/9router otomatis di-check; HTTP 401/402 masuk Banned. Format JSON
              lain tetap diterima sebagai stok generik. Stok archived tetap archived.
            </p>
            <div className="inventory-edit-actions">
              <button className="button button-primary" type="submit">
                <Save aria-hidden="true" size={18} />
                Simpan &amp; check ulang
              </button>
              <Link className="button button-ghost" href={returnTo} prefetch={false}>
                Batal
              </Link>
            </div>
          </form>
        </section>
      )}
    </AdminShell>
  );
}
