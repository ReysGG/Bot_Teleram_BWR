"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Layers3, Save } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { LocalizedCatalogDescriptionFields } from "@/components/admin/catalog-description-fields";
import { submitAdminForm } from "@/components/admin/submit-admin-form";

type ProductGroupValue = {
  id: string;
  name: string;
  description: string;
  descriptionEntities: unknown;
  descriptionEn?: string | null;
  descriptionEntitiesEn?: unknown;
  imageUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  sortOrder: number;
};

export function ProductGroupForm({ group }: { group?: ProductGroupValue }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const editing = Boolean(group);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setConfirmOpen(true);
  }

  async function confirmSubmit() {
    const form = formRef.current;
    if (submitting || !form) return;
    setSubmitting(true);
    setSubmitError(null);
    setConfirmOpen(false);
    try {
      const result = await submitAdminForm(form);
      if (!result.ok) {
        setSubmitError(result.error === "group-description"
          ? "Format deskripsi Indonesia atau English tidak valid. Periksa panjang teks, link HTTPS, dan formatnya."
          : "Data grup tidak valid atau perubahan tidak dapat disimpan.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSubmitError("Koneksi ke server gagal. Semua input tetap tersimpan; coba lagi setelah koneksi stabil.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action={editing ? `/api/admin/product-groups/${group?.id}` : "/api/admin/product-groups"}
        className="product-group-form"
        method="post"
        onSubmit={handleSubmit}
      >
        <div className="product-group-settings-grid">
          <label>
            Nama grup
            <input
              defaultValue={group?.name ?? ""}
              maxLength={100}
              name="name"
              placeholder="ChatGPT"
              required
            />
          </label>
          <label>
            Urutan katalog
            <input
              defaultValue={group?.sortOrder ?? 0}
              max="1000000"
              min="-1000000"
              name="sortOrder"
              required
              type="number"
            />
          </label>
          <label>
            Status grup
            <select defaultValue={group?.status ?? "ACTIVE"} name="status">
              <option value="ACTIVE">Aktif</option>
              <option value="INACTIVE">Nonaktif</option>
            </select>
            <small>Nonaktif menyembunyikan seluruh varian dari katalog baru.</small>
          </label>
          <label>
            URL gambar opsional
            <input
              defaultValue={group?.imageUrl ?? ""}
              name="imageUrl"
              placeholder="https://..."
              type="url"
            />
          </label>
        </div>
        <LocalizedCatalogDescriptionFields
          description={group?.description}
          descriptionEn={group?.descriptionEn}
          entities={group?.descriptionEntities}
          entitiesEn={group?.descriptionEntitiesEn}
          subject="grup"
        />
        <div className="product-group-form-footer">
          <p className="fine-print">
            Harga, stok, preorder, lampiran, dan aturan banned tetap diatur pada setiap varian produk.
          </p>
          <button className="button button-primary" disabled={submitting} type="submit">
            <Save aria-hidden="true" size={18} />
            {submitting ? "Sedang menyimpan..." : editing ? "Simpan grup" : "Buat grup"}
          </button>
        </div>
      </form>

      <AdminDialog
        className="confirm-modal"
        description="Deskripsi Indonesia menjadi fallback; English hanya digunakan saat sudah diisi dan valid."
        dismissable={!submitting}
        eyebrow="Konfirmasi katalog"
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={editing ? "Simpan perubahan grup?" : "Buat grup produk?"}
      >
        <p>
          {editing
            ? "Perubahan ini memengaruhi cara grup dan variannya tampil pada katalog berikutnya."
            : "Setelah grup dibuat, produk dapat dipindahkan ke dalamnya sebagai varian."}
        </p>
        <div className="admin-modal-actions">
          <button className="button button-primary" disabled={submitting} type="button" onClick={confirmSubmit}>
            <Layers3 aria-hidden="true" size={17} />
            {editing ? "Ya, simpan" : "Ya, buat grup"}
          </button>
          <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setConfirmOpen(false)}>Batal</button>
        </div>
      </AdminDialog>

      <AdminResultModal
        message={`${submitError ?? ""} Semua input tetap berada di form sehingga tidak perlu diketik ulang.`}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSubmitError(null);
        }}
        open={Boolean(submitError)}
        tone="error"
      />

      {submitting ? (
        <AdminProcessingOverlay
          title={editing ? "Perubahan grup sedang disimpan" : "Grup produk sedang dibuat"}
          description="Katalog sedang diperbarui. Tunggu sampai proses selesai."
        />
      ) : null}
    </>
  );
}
