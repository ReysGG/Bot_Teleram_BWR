"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { FileKey, UploadCloud } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

const MAX_ACCOUNT_LOGIN_FILE_BYTES = 5 * 1024 * 1024;

export function accountLoginFileSelectionError(
  files: Array<Pick<File, "name" | "size">>,
): string | null {
  if (files.length === 0) return "Pilih minimal satu file TXT.";
  const invalidType = files.find((file) => !/\.txt$/i.test(file.name));
  if (invalidType) return `${invalidType.name} bukan file TXT.`;
  const tooLarge = files.find((file) => file.size > MAX_ACCOUNT_LOGIN_FILE_BYTES);
  if (tooLarge) return `${tooLarge.name} melebihi batas 5 MB.`;
  return null;
}

export function AccountLoginUploadForm() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [estimatedRows, setEstimatedRows] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectFiles(list: FileList | File[]) {
    const selected = Array.from(list);
    setFiles(selected);
    setEstimatedRows(0);
    const selectionError = accountLoginFileSelectionError(selected);
    setError(selectionError);

    if (inputRef.current) {
      const transfer = new DataTransfer();
      selected.forEach((file) => transfer.items.add(file));
      inputRef.current.files = transfer.files;
    }
    if (selectionError) return;

    let rows = 0;
    try {
      for (const file of selected) {
        rows += (await file.text()).split(/\r?\n/).filter((line) => line.trim()).length;
      }
      setEstimatedRows(rows);
    } catch {
      setError("Salah satu file tidak dapat dibaca. Pastikan file TXT valid.");
    }
  }

  function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void selectFiles(event.target.files);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDragging(false);
    if (!submitting) void selectFiles(event.dataTransfer.files);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (submitting || files.length === 0 || error) {
      event.preventDefault();
      return;
    }
    setSubmitting(true);
  }

  return (
    <>
      <form
        action="/api/admin/redeem-credentials"
        className="stack-form"
        encType="multipart/form-data"
        method="post"
        onSubmit={handleSubmit}
      >
        <input
          ref={inputRef}
          accept=".txt,text/plain"
          className="visually-hidden"
          multiple
          name="files"
          required
          type="file"
          onChange={handleFiles}
        />
        <button
          className={`stock-dropzone${dragging ? " is-dragging" : ""}`}
          disabled={submitting}
          type="button"
          onClick={() => {
            if (!inputRef.current) return;
            inputRef.current.value = "";
            inputRef.current.click();
          }}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!submitting) setDragging(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setDragging(false);
            }
          }}
          onDrop={handleDrop}
        >
          <FileKey aria-hidden="true" size={34} strokeWidth={1.7} />
          <strong>Tarik file TXT ke sini</strong>
          <span>Atau klik untuk memilih · satu atau banyak file · 5 MB per file</span>
        </button>
        {files.length > 0 ? (
          <div className="selected-files" aria-live="polite">
            <div>
              <FileKey aria-hidden="true" size={18} />
              <strong>{files.length} file · estimasi {estimatedRows} baris</strong>
            </div>
            <p>{files.slice(0, 3).map((file) => file.name).join(", ")}{files.length > 3 ? `, dan ${files.length - 3} lainnya` : ""}</p>
          </div>
        ) : null}
        {error ? <p className="upload-error">{error}</p> : null}
        <p className="fine-print">
          Format tiap baris: email----password----client ID----token. Email penuh,
          password, dan token disimpan terenkripsi serta tidak pernah ditampilkan di dashboard.
          Baris duplikat identik dilewati; konflik email/token ditolak dengan aman.
        </p>
        <button
          className="button button-primary"
          disabled={submitting || files.length === 0 || Boolean(error)}
          type="submit"
        >
          <UploadCloud aria-hidden="true" size={18} />
          {submitting ? "Sedang memproses..." : "Enkripsi dan simpan data login"}
        </button>
      </form>
      {submitting ? (
        <AdminProcessingOverlay
          title="Data login sedang diproses"
          description="Sistem sedang memvalidasi format, mendeteksi konflik, mengenkripsi credential, dan menyimpan audit. Jangan menutup halaman ini."
        />
      ) : null}
    </>
  );
}
