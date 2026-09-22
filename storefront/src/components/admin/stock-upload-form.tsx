"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Files, UploadCloud } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { submitAdminForm } from "@/components/admin/submit-admin-form";
import { stockUploadErrorMessage } from "@/lib/admin-stock-upload-errors";
import {
  countUniquePastedStockLines,
  MAX_PASTED_STOCK_BYTES,
} from "@/lib/stock-upload";

type ProductOption = { id: string; name: string };

export function StockUploadForm({
  compact = false,
  products = [],
  product,
  returnTo,
  action = "/api/admin/inventory",
  allowedRedirectPrefixes = ["/admin"],
}: {
  compact?: boolean;
  products?: ProductOption[];
  product?: ProductOption;
  returnTo?: string;
  action?: string;
  allowedRedirectPrefixes?: string[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [estimatedFileItems, setEstimatedFileItems] = useState(0);
  const [stockLines, setStockLines] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState(product?.id ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [requestKey] = useState(() => crypto.randomUUID());
  const disabled = !product && products.length === 0;
  const selectedProduct = product ?? products.find((item) => item.id === selectedProductId);
  const pastedLineCount = countUniquePastedStockLines(stockLines);
  const estimatedItems = estimatedFileItems + pastedLineCount;
  const stockLinesBytes = new TextEncoder().encode(stockLines).byteLength;
  const stockLinesTooLarge = stockLinesBytes > MAX_PASTED_STOCK_BYTES;
  const hasStockInput = files.length > 0 || pastedLineCount > 0;

  async function selectFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const selected = incoming;
    setError(null);

    if (inputRef.current) {
      const transfer = new DataTransfer();
      selected.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    setFiles(selected);
    const identities = new Set<string>();
    for (const file of selected) {
      if (!/\.(json|txt)$/i.test(file.name)) {
        identities.add(`file:${file.name}:${file.size}:${file.lastModified}`);
        continue;
      }
      const text = (await file.text()).trim();
      if (!text) continue;
      try {
        const parsed: unknown = JSON.parse(text);
        if (Array.isArray(parsed)) {
          parsed.forEach((item) => identities.add(`json-item:${JSON.stringify(item)}`));
        } else {
          identities.add(`json:${text}`);
        }
      } catch {
        if (!/\.txt$/i.test(file.name)) {
          identities.add(`file:${file.name}:${file.size}:${file.lastModified}`);
          continue;
        }
        text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line) => {
          identities.add(`line:${line}`);
        });
      }
    }
    setEstimatedFileItems(identities.size);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void selectFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) void selectFiles(event.dataTransfer.files);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading) return;
    if (!hasStockInput) {
      setError("Tambahkan file atau paste minimal satu stok.");
      return;
    }
    if (stockLinesTooLarge) {
      setError("Teks stok melebihi 1 MB. Pecah menjadi beberapa proses upload.");
      return;
    }
    setError(null);
    setUploadError(null);
    setConfirmOpen(true);
  }

  async function confirmUpload() {
    const form = formRef.current;
    if (uploading || !form) return;
    setUploading(true);
    setUploadError(null);
    setConfirmOpen(false);
    try {
      const result = await submitAdminForm(form, fetch, allowedRedirectPrefixes);
      if (!result.ok) {
        setUploadError(stockUploadErrorMessage(result.error));
        setUploading(false);
        return;
      }
      setUploading(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setUploadError(stockUploadErrorMessage("network"));
      setUploading(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action={action}
        method="post"
        encType="multipart/form-data"
        className={`stack-form stock-upload-form${compact ? " is-compact" : ""}`}
        onSubmit={handleSubmit}
      >
      {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
      <input name="requestKey" type="hidden" value={requestKey} />
      {product ? (
        <div className="selected-files stock-upload-product">
          <div>
            <Files aria-hidden="true" size={18} />
            <strong>Stok untuk {product.name}</strong>
          </div>
          <p>Semua file pada upload ini hanya masuk ke produk tersebut.</p>
          <input name="productId" type="hidden" value={product.id} />
        </div>
      ) : (
        <label>
          Produk
          <select
            name="productId"
            required
            value={selectedProductId}
            disabled={disabled}
            onChange={(event) => setSelectedProductId(event.target.value)}
          >
            <option value="" disabled>
              {disabled ? "Buat produk terlebih dahulu" : "Pilih produk"}
            </option>
            {products.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="stock-lines-field">
        <span className="stock-lines-label">
          Paste stok
          <small>Satu baris = satu stok baru</small>
        </span>
        <textarea
          className="stock-lines-input"
          disabled={disabled || uploading}
          name="stockLines"
          onChange={(event) => {
            setStockLines(event.target.value);
            setError(null);
          }}
          placeholder={"token-atau-akun-1\ntoken-atau-akun-2\ntoken-atau-akun-3"}
          rows={compact ? 10 : 16}
          value={stockLines}
        />
        <small className="stock-lines-meta">
          {pastedLineCount > 0
            ? `${pastedLineCount} baris unik siap diproses`
            : "Baris kosong diabaikan; duplikat dilewati otomatis."}
          {stockLinesTooLarge ? " Teks terlalu besar." : ""}
        </small>
      </label>

      <div className="stock-input-divider" aria-hidden="true"><span>atau upload file</span></div>
      <input
        ref={inputRef}
        className="visually-hidden"
        name="files"
        type="file"
        multiple
        onChange={handleInput}
      />
      <button
        className={`stock-dropzone${dragging ? " is-dragging" : ""}`}
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        <UploadCloud aria-hidden="true" size={34} strokeWidth={1.7} />
        <strong>Tarik file stok ke sini</strong>
        <span>JSON, TXT, atau format file lain · hingga 5.000 stok per proses</span>
      </button>

      {files.length > 0 || pastedLineCount > 0 ? (
        <div className="selected-files" aria-live="polite">
          <div>
            <Files aria-hidden="true" size={18} />
            <strong>
              {files.length > 0 ? `${files.length} file` : "Paste stok"}
              {files.length > 0 && pastedLineCount > 0 ? " + " : ""}
              {pastedLineCount > 0 ? `${pastedLineCount} baris` : ""}
              {` / estimasi ${estimatedItems} stok`}
            </strong>
          </div>
          {files.length > 0 ? (
            <p>
              {files
                .slice(0, 3)
                .map((file) => file.name)
                .join(", ")}
              {files.length > 3 ? `, dan ${files.length - 3} lainnya` : ""}
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="upload-error">{error}</p> : null}

      {disabled ? (
        <p className="fine-print">Belum ada produk. Buat produk terlebih dahulu sebelum memasukkan stok.</p>
      ) : compact ? (
        <details className="stock-upload-help">
          <summary>Format dan pemeriksaan otomatis</summary>
          <p className="fine-print">
            Paste stok memakai satu baris untuk satu item. Semua file juga diterima dan dienkripsi. JSON array dipecah per akun; baris sama dan credential yang sudah ada otomatis dilewati. JSON K12/9router tetap dideteksi untuk check quota serta HTTP 401/402.
          </p>
        </details>
      ) : (
        <p className="fine-print">
          Paste stok memakai satu baris untuk satu item. Semua file juga diterima dan dienkripsi. JSON array dipecah per akun; baris sama dan credential yang sudah ada otomatis dilewati. JSON K12/9router tetap dideteksi untuk check quota serta HTTP 401/402.
        </p>
      )}
      <button
        className="button button-light"
        type="submit"
        disabled={disabled || !hasStockInput || stockLinesTooLarge || uploading}
      >
        <UploadCloud aria-hidden="true" size={18} />
        {uploading ? "Sedang mengupload..." : "Enkripsi dan masukkan stok"}
      </button>
      </form>

      <AdminDialog
        description="Konfirmasi teks, file, dan produk tujuan sebelum stok dienkripsi serta diperiksa."
        dismissable={!uploading}
        eyebrow="Konfirmasi upload"
        layer="nested"
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Masukkan stok ke gudang?"
      >
        <div className="stack-form">
          <p>
            <strong>
              {files.length > 0 ? `${files.length} file` : "Paste stok"}
              {files.length > 0 && pastedLineCount > 0 ? " + " : ""}
              {pastedLineCount > 0 ? `${pastedLineCount} baris` : ""}
              {` (estimasi ${estimatedItems} stok)`}
            </strong>{" "}akan dienkripsi dan dimasukkan ke
            produk <strong>{selectedProduct?.name ?? "yang dipilih"}</strong>.
          </p>
          <p className="fine-print">
            Setiap baris kosong diabaikan. Sistem melewati baris/credential duplikat, mendeteksi K12/9router,
            lalu mengecek quota. Jumlah akhir bisa lebih kecil jika sudah ada di gudang.
          </p>
          <div className="admin-modal-actions">
            <button className="button button-primary" disabled={uploading} type="button" onClick={confirmUpload}>
              <UploadCloud aria-hidden="true" size={18} />
              {uploading ? "Mengupload..." : "Ya, upload stok"}
            </button>
            <button className="button button-ghost" type="button" onClick={() => setConfirmOpen(false)}>
              Batal
            </button>
          </div>
        </div>
      </AdminDialog>
      <AdminResultModal
        message={`${uploadError ?? ""} File dan teks stok tetap tersedia di form. Tutup pesan ini untuk memperbaiki atau mencoba kembali.`}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setUploadError(null);
        }}
        open={Boolean(uploadError)}
        tone="error"
      />
      {uploading ? (
        <AdminProcessingOverlay
          title="Stok sedang diproses"
          description="Stok sedang dikirim, dienkripsi, diperiksa duplikat dan quota, lalu notifikasi restock akan dimasukkan ke antrean. Jangan tutup halaman ini."
        />
      ) : null}
    </>
  );
}
