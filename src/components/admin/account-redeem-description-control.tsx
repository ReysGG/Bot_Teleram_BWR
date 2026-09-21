"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save, Settings2 } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { submitAdminForm } from "@/components/admin/submit-admin-form";

const descriptionErrorMessages: Record<string, string> = {
  description: "Deskripsi tidak dapat disimpan. Pastikan teks tidak kosong dan tidak melebihi batas Telegram.",
  "admin-session": "Sesi admin sudah berakhir. Login kembali di tab lain, lalu kirim ulang draft yang masih terbuka ini.",
  "admin-origin": "Permintaan ditolak oleh pemeriksaan keamanan origin.",
  "invalid-response": "Server memberi respons yang tidak dikenali. Tidak ada perubahan yang dianggap berhasil.",
  network: "Koneksi ke server terputus. Periksa internet lalu coba lagi.",
};

function descriptionErrorMessage(error: string) {
  return descriptionErrorMessages[error] ?? descriptionErrorMessages.description;
}

export function AccountRedeemDescriptionControl({
  defaultDescription,
  description,
  isDefault,
  maxLength,
  updatedAt,
}: {
  defaultDescription: string;
  description: string;
  isDefault: boolean;
  maxLength: number;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(description);
  const [resetOpen, setResetOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  async function submitDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSaveError(null);
    try {
      const result = await submitAdminForm(event.currentTarget);
      if (!result.ok) {
        setSaveError(descriptionErrorMessage(result.error));
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSaveError(descriptionErrorMessage("network"));
      setSubmitting(false);
    }
  }

  async function resetDescription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setResetError(null);
    try {
      const result = await submitAdminForm(event.currentTarget);
      if (!result.ok) {
        setResetError(descriptionErrorMessage(result.error));
        setSubmitting(false);
        return;
      }
      setValue(defaultDescription);
      setResetOpen(false);
      setSubmitting(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setResetError(descriptionErrorMessage("network"));
      setSubmitting(false);
    }
  }

  return (
    <>
      <section className="panel product-stock-intake">
        <div className="panel-heading">
          <div className="panel-heading-title">
            <span className="panel-heading-icon"><Settings2 aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Telegram claim copy</p>
              <h2>Deskripsi claim mail</h2>
            </div>
          </div>
          <span className={`status-pill ${isDefault ? "status-neutral" : "status-good"}`}>
            {isDefault ? "Teks default" : "Teks custom"}
          </span>
        </div>
        <form
          action="/api/admin/redeem-settings"
          className="stack-form"
          method="post"
          onSubmit={submitDescription}
        >
          <input name="intent" type="hidden" value="save" />
          <label>
            Pesan pemberitahuan untuk pembeli
            <textarea
              maxLength={maxLength}
              minLength={1}
              name="description"
              required
              rows={8}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <p className="fine-print">
            Teks ini muncul di menu Ambil Data Login Codex Free. Statistik batch,
            tombol proses, dan validasi kepemilikan tetap dikunci oleh sistem.
            {updatedAt ? ` Terakhir diubah ${updatedAt}.` : ""}
          </p>
          <div className="admin-modal-actions">
            <button
              className="button button-primary"
              disabled={submitting || value.trim().length === 0}
              type="submit"
            >
              <Save aria-hidden="true" size={18} />
              {submitting ? "Sedang menyimpan..." : "Simpan deskripsi"}
            </button>
            <button
              className="button button-ghost"
              disabled={submitting || isDefault}
              type="button"
              onClick={() => {
                setResetError(null);
                setResetOpen(true);
              }}
            >
              <RotateCcw aria-hidden="true" size={17} />
              Kembalikan default
            </button>
          </div>
        </form>
      </section>

      <AdminResultModal
        message={`${saveError ?? ""} Teks panjang yang sudah ditulis tetap berada di form dan bisa langsung dicoba kembali.`}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSaveError(null);
        }}
        open={Boolean(saveError)}
        tone="error"
      />

      <AdminDialog
        className="confirm-modal"
        description="Konfirmasi penggantian deskripsi claim mail dengan teks bawaan."
        dismissable={!submitting}
        eyebrow="Reset Telegram copy"
        layer="nested"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setResetError(null);
          setResetOpen(nextOpen);
        }}
        open={resetOpen}
        title="Kembalikan deskripsi default?"
      >
        <p className="fine-print">
          Deskripsi custom akan diganti dengan teks bawaan berikut:
        </p>
        <div className="selected-files">
          <p className="redeem-description-preview">{defaultDescription}</p>
        </div>
        <form
          action="/api/admin/redeem-settings"
          className="admin-modal-actions"
          method="post"
          onSubmit={resetDescription}
        >
          <input name="intent" type="hidden" value="reset" />
          <button className="button button-danger" disabled={submitting} type="submit">
            <RotateCcw aria-hidden="true" size={17} />
            {submitting ? "Sedang mereset..." : "Ya, pakai teks default"}
          </button>
          <button
            className="button button-ghost"
            disabled={submitting}
            type="button"
            onClick={() => setResetOpen(false)}
          >
            Batal
          </button>
        </form>
        <AdminResultModal
          message={`${resetError ?? ""} Deskripsi custom belum diubah. Tutup pesan ini untuk mencoba lagi.`}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setResetError(null);
          }}
          open={Boolean(resetError)}
          tone="error"
        />
      </AdminDialog>

      {submitting ? (
        <AdminProcessingOverlay
          title="Deskripsi claim sedang diperbarui"
          description="Sistem sedang menyimpan pengaturan dan menyiapkan teks terbaru untuk interaksi Telegram berikutnya."
        />
      ) : null}
    </>
  );
}
