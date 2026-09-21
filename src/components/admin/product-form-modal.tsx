"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpenCheck,
  Clock3,
  FolderTree,
  ImageIcon,
  PackageCheck,
  Pencil,
  PlusCircle,
  Save,
} from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFormSection } from "@/components/admin/admin-form-section";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { ProductMediaFields } from "@/components/admin/product-media-fields";
import { ProductPostDeliveryFields } from "@/components/admin/product-post-delivery-fields";
import { LocalizedCatalogDescriptionFields } from "@/components/admin/catalog-description-fields";
import { submitAdminForm } from "@/components/admin/submit-admin-form";
import { productFormErrorMessage } from "@/lib/admin-product-form-errors";

type EditableProduct = {
  id: string;
  name: string;
  description: string;
  descriptionEntities: unknown;
  descriptionEn?: string | null;
  descriptionEntitiesEn?: unknown;
  price: number;
  imageUrl: string | null;
  attachmentOriginalFilename: string | null;
  postDeliveryInstructions: string | null;
  postDeliveryEntities: unknown;
  redeemUrl: string | null;
  status: "ACTIVE" | "INACTIVE";
  preorderEnabled: boolean;
  preorderEtaText: string | null;
  preorderLimit: number | null;
  groupId: string | null;
  variantLabel: string | null;
  groupSortOrder: number;
};

type ProductGroupOption = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };

export function ProductFormModal({
  mode,
  product,
  groups = [],
  defaultGroupId = "",
  returnTo,
  triggerLabel,
}: {
  mode: "create" | "edit";
  product?: EditableProduct;
  groups?: ProductGroupOption[];
  defaultGroupId?: string;
  returnTo?: string;
  triggerLabel?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const editing = mode === "edit";
  const [selectedGroupId, setSelectedGroupId] = useState(product?.groupId ?? defaultGroupId);
  const selectedGroupName = groups.find((group) => group.id === selectedGroupId)?.name;

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
        setSubmitError(productFormErrorMessage(result.error));
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      setOpen(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSubmitError(productFormErrorMessage("network"));
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminDialog
        className="product-form-modal"
        description={editing
          ? "Edit informasi katalog, harga, media, varian, dan panduan produk."
          : "Buat produk atau varian baru beserta harga, media, dan panduan pembeli."}
        dismissable={!submitting}
        eyebrow={editing ? "Update catalog" : "New catalog"}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setSubmitError(null);
          setOpen(nextOpen);
        }}
        open={open}
        title={editing ? "Edit produk" : "Tambah produk"}
        trigger={(
          <button
            className={`button ${editing ? "button-small" : "button-primary"}`}
            type="button"
          >
            {editing ? (
              <Pencil aria-hidden="true" size={15} />
            ) : (
              <PlusCircle aria-hidden="true" size={18} />
            )}
            {triggerLabel ?? (editing ? "Edit produk" : "Tambah produk")}
          </button>
        )}
      >
        <form
          ref={formRef}
          action={editing ? `/api/admin/products/${product?.id}` : "/api/admin/products"}
          className="stack-form modal-scroll-form"
          encType="multipart/form-data"
          method="post"
          onSubmit={handleSubmit}
        >
              {returnTo ? <input name="returnTo" type="hidden" value={returnTo} /> : null}
              {editing ? <input name="status" type="hidden" value={product?.status ?? "ACTIVE"} /> : null}
              <div className="product-edit-section-list">
                <AdminFormSection
                  className="is-wide"
                  eyebrow="Langkah utama"
                  icon={<PackageCheck aria-hidden="true" />}
                  title="Nama, harga, dan deskripsi publik"
                  description="Isi bagian ini dulu. Field lain bersifat opsional dan bisa dibuka saat diperlukan."
                >
                  <div className="split-fields">
                    <label>
                      Nama produk
                      <input
                        defaultValue={product?.name ?? ""}
                        maxLength={100}
                        name="name"
                        placeholder="ChatGPT K12"
                        required
                      />
                    </label>
                    <label>
                      Harga
                      <input
                        defaultValue={product?.price ?? ""}
                        min="1"
                        name="price"
                        placeholder="25000"
                        required
                        type="number"
                      />
                    </label>
                  </div>
                  <LocalizedCatalogDescriptionFields
                    description={product?.description}
                    descriptionEn={product?.descriptionEn}
                    entities={product?.descriptionEntities}
                    entitiesEn={product?.descriptionEntitiesEn}
                    previewMode="toggle"
                  />
                </AdminFormSection>

                <AdminFormSection
                  collapsible
                  defaultOpen={Boolean(selectedGroupId)}
                  eyebrow="Struktur katalog"
                  icon={<FolderTree aria-hidden="true" />}
                  status={selectedGroupName ?? "Standalone"}
                  title="Grup dan posisi varian"
                  description="Buka hanya jika produk ini adalah varian di dalam parent seperti ChatGPT atau Claude."
                >
                  <div className="split-fields">
                    <label>
                      Grup produk opsional
                      <select
                        name="groupId"
                        value={selectedGroupId}
                        onChange={(event) => setSelectedGroupId(event.target.value)}
                      >
                        <option value="">Produk standalone</option>
                        {groups.map((group) => (
                          <option key={group.id} value={group.id}>
                            {group.name}{group.status === "INACTIVE" ? " (nonaktif)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Nama varian
                      <input
                        defaultValue={product?.variantLabel ?? ""}
                        disabled={!selectedGroupId}
                        maxLength={100}
                        name="variantLabel"
                        placeholder="K12 JSON"
                        required={Boolean(selectedGroupId)}
                      />
                    </label>
                  </div>
                  <label>
                    Urutan varian dalam grup
                    <input
                      defaultValue={product?.groupSortOrder ?? 0}
                      disabled={!selectedGroupId}
                      max="1000000"
                      min="-1000000"
                      name="groupSortOrder"
                      type="number"
                    />
                    <small>Angka lebih kecil tampil lebih dahulu.</small>
                  </label>
                </AdminFormSection>

                <AdminFormSection
                  collapsible
                  eyebrow="Media"
                  icon={<ImageIcon aria-hidden="true" />}
                  status={product?.imageUrl || product?.attachmentOriginalFilename ? "Sudah diatur" : "Opsional"}
                  title="Gambar dan file bonus"
                  description="Gambar tampil di katalog. Lampiran hanya dikirim kepada pembeli."
                >
                  <ProductMediaFields
                    attachmentOriginalFilename={product?.attachmentOriginalFilename ?? null}
                    imageUrl={product?.imageUrl ?? null}
                  />
                </AdminFormSection>

                <AdminFormSection
                  className="is-wide"
                  collapsible
                  eyebrow="Setelah pengiriman"
                  icon={<BookOpenCheck aria-hidden="true" />}
                  status={product?.postDeliveryInstructions || product?.redeemUrl ? "Sudah diatur" : "Opsional"}
                  title="Panduan privat pembeli"
                  description="Kirim langkah redeem setelah file berhasil diterima."
                >
                  <ProductPostDeliveryFields
                    entities={product?.postDeliveryEntities}
                    instructions={product?.postDeliveryInstructions}
                    redeemUrl={product?.redeemUrl}
                  />
                </AdminFormSection>

                <AdminFormSection
                  className="is-wide"
                  collapsible
                  eyebrow="Ketersediaan"
                  icon={<Clock3 aria-hidden="true" />}
                  status={product?.preorderEnabled ? "Aktif" : "Nonaktif"}
                  title="Preorder saat stok habis"
                  description="Buka bagian ini hanya jika produk menerima antrean preorder."
                >
                  <label className="checkbox-row">
                    <input
                      defaultChecked={product?.preorderEnabled ?? false}
                      name="preorderEnabled"
                      type="checkbox"
                    />
                    <span>Aktifkan preorder ketika stok sehat habis</span>
                  </label>
                  <div className="split-fields">
                    <label>
                      Estimasi preorder
                      <input defaultValue={product?.preorderEtaText ?? ""} maxLength={120} name="preorderEtaText" placeholder="1-3 hari" />
                    </label>
                    <label>
                      Batas antrean
                      <input defaultValue={product?.preorderLimit ?? ""} max="10000" min="1" name="preorderLimit" placeholder="20" type="number" />
                    </label>
                  </div>
                </AdminFormSection>
              </div>
              <p className="fine-print">
                Perubahan harga hanya berlaku untuk checkout baru. Order lama tetap memakai
                harga saat transaksi dibuat.
              </p>
              <div className="admin-modal-actions">
                <button className="button button-primary" disabled={submitting} type="submit">
                  <Save aria-hidden="true" size={18} />
                  {submitting
                    ? "Sedang memproses..."
                    : editing
                      ? "Simpan perubahan"
                      : "Buat produk"}
                </button>
                <button
                  className="button button-ghost"
                  type="button"
                  disabled={submitting}
                  onClick={() => setOpen(false)}
                >
                  Batal
                </button>
              </div>
        </form>
        <AdminDialog
          className="confirm-modal"
          description={editing
            ? "Konfirmasi penyimpanan perubahan produk."
            : "Konfirmasi pembuatan produk baru."}
          dismissable={!submitting}
          eyebrow="Konfirmasi produk"
          layer="nested"
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title={editing ? "Simpan perubahan produk?" : "Buat produk baru?"}
        >
          <p>
            {editing
              ? "Harga dan relasi grup baru hanya berlaku untuk checkout berikutnya. Riwayat order lama tetap memakai snapshot sebelumnya."
              : "Pastikan harga dan grup varian sudah benar sebelum produk diumumkan ke pelanggan."}
          </p>
          <div className="admin-modal-actions">
            <button className="button button-primary" disabled={submitting} type="button" onClick={confirmSubmit}><Save aria-hidden="true" size={17} /> Ya, proses</button>
            <button className="button button-ghost" type="button" onClick={() => setConfirmOpen(false)}>Periksa lagi</button>
          </div>
        </AdminDialog>
        <AdminResultModal
          message={`${submitError ?? ""} Semua input dan file yang dipilih tetap tersimpan. Perbaiki bagian yang salah lalu coba lagi.`}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) setSubmitError(null);
          }}
          open={Boolean(submitError)}
          tone="error"
        />
      </AdminDialog>
      {submitting ? (
        <AdminProcessingOverlay
          title={editing ? "Perubahan produk sedang disimpan" : "Produk sedang dibuat"}
          description={editing
            ? "Data katalog dan lampiran sedang diproses."
            : "Data katalog sedang disimpan dan announcement produk baru sedang disiapkan untuk subscriber."}
        />
      ) : null}
    </>
  );
}
