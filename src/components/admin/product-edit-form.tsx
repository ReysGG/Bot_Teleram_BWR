"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import { BookOpenCheck, Clock3, FolderTree, ImageIcon, PackageCheck, Save } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminFormSection } from "@/components/admin/admin-form-section";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { LocalizedCatalogDescriptionFields } from "@/components/admin/catalog-description-fields";
import { ProductMediaFields } from "@/components/admin/product-media-fields";
import { ProductPostDeliveryFields } from "@/components/admin/product-post-delivery-fields";
import { submitAdminForm } from "@/components/admin/submit-admin-form";
import { productFormErrorMessage } from "@/lib/admin-product-form-errors";

type ProductEditValue = {
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
  bannedStockPolicy: "BLOCKED" | "ALLOW_HTTP_401" | "OWNER_APPROVAL" | "RELOGIN_REQUIRED";
  groupId: string | null;
  variantLabel: string | null;
  groupSortOrder: number;
};

type ProductGroupOption = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };

export function ProductEditForm({ product: initialProduct, groups, defaultGroupId = "", returnTo }: { product?: ProductEditValue; groups: ProductGroupOption[]; defaultGroupId?: string; returnTo?: string }) {
  const editing = Boolean(initialProduct);
  const product: ProductEditValue = initialProduct ?? { id: "", name: "", description: "", descriptionEntities: [], price: 0, imageUrl: null, attachmentOriginalFilename: null, postDeliveryInstructions: null, postDeliveryEntities: [], redeemUrl: null, status: "ACTIVE", preorderEnabled: false, preorderEtaText: null, preorderLimit: null, bannedStockPolicy: "BLOCKED", groupId: defaultGroupId || null, variantLabel: null, groupSortOrder: 0 };
  const router = useRouter();
  const tabId = useId();
  const [activeTab, setActiveTab] = useState("info");
  const [draftName, setDraftName] = useState(product.name);
  const tabs = [{ id: "info", label: "Info produk" }, { id: "media", label: "Media & panduan" }, { id: "settings", label: "Pengaturan" }];
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedGroupId, setSelectedGroupId] = useState(product.groupId ?? "");
  const [dirty, setDirty] = useState(false);
  const [preorderEnabled, setPreorderEnabled] = useState(product.preorderEnabled);
  const [price, setPrice] = useState(editing ? String(product.price) : "");
  const [validationMessage, setValidationMessage] = useState("");
  const [review, setReview] = useState({ name: "", price: "", group: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [removals, setRemovals] = useState({ image: false, attachment: false });
  const selectedGroupName = groups.find((group) => group.id === selectedGroupId)?.name;

  useEffect(() => {
    if (!dirty || submitting) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const leave = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0 || !target || target.target === "_blank" || target.hasAttribute("download") || target.hash && target.pathname === window.location.pathname) return;
      if (!window.confirm("Perubahan belum disimpan. Tetap tinggalkan halaman ini?")) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leave, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", leave, true); };
  }, [dirty, submitting]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setValidationMessage("");
    const data = new FormData(event.currentTarget);
    setReview({ name: String(data.get("name") ?? ""), price: Number(data.get("price")).toLocaleString("id-ID"), group: selectedGroupName ?? "Tanpa grup" });
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
      setDirty(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSubmitError(productFormErrorMessage("network"));
      setSubmitting(false);
    }
  }

  return (
    <>
      <form
        ref={formRef}
        action={editing ? `/api/admin/products/${product.id}` : "/api/admin/products"}
        className="product-edit-form"
        encType="multipart/form-data"
        method="post"
        onSubmit={handleSubmit}
        onInputCapture={() => { setDirty(true); setValidationMessage(""); }}
        onChangeCapture={() => { setDirty(true); setValidationMessage(""); }}
        onInvalidCapture={(event) => {
          const field = event.target as HTMLElement;
          const firstInvalid = formRef.current?.querySelector("input:invalid,select:invalid,textarea:invalid");
          if (firstInvalid && firstInvalid !== field) return;
          const panel = field.closest<HTMLElement>("[data-editor-tab]");
          if (panel) flushSync(() => setActiveTab(panel.dataset.editorTab!));
          let parent = field.parentElement;
          while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
          setValidationMessage("Lengkapi kolom yang ditandai sebelum menyimpan.");
        }}
      >
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {validationMessage ? <p role="alert" className="product-validation-message">{validationMessage}</p> : null}
      <div className="product-editor-main">
        <div className="product-editor-tabs" role="tablist" aria-label="Bagian produk">
          {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${tabId}-${tab.id}`} aria-controls={`${tabId}-${tab.id}-panel`} aria-selected={activeTab === tab.id} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={event => {
            const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (offset || event.key === "Home" || event.key === "End") {
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + offset + tabs.length) % tabs.length;
              setActiveTab(tabs[next].id); document.getElementById(`${tabId}-${tabs[next].id}`)?.focus();
            }
          }}>{tab.label}</button>)}
        </div>
        <section className="product-editor-panel" data-editor-tab="info" role="tabpanel" id={`${tabId}-info-panel`} aria-labelledby={`${tabId}-info`} hidden={activeTab !== "info"}>
<AdminFormSection
          className="is-wide"
          eyebrow="Informasi utama"
          icon={<PackageCheck aria-hidden="true" />}
          title="Nama, harga, dan deskripsi publik"
          description="Informasi ini terlihat oleh pembeli. Harga baru hanya berlaku untuk checkout berikutnya."
        >
          <div className="split-fields">
            <label>
              Nama produk
              <input value={draftName} onChange={event => setDraftName(event.target.value)} minLength={2} maxLength={100} name="name" required />
            </label>
            <label>
              Harga per unit (Rp)
              <input value={price} onChange={event => setPrice(event.target.value)} min="1" max="1000000000" step="1" inputMode="numeric" name="price" required type="number" placeholder="25000" />
              <small>{price ? `Rp ${Number(price).toLocaleString("id-ID")} per unit` : "Masukkan angka tanpa titik, misalnya 25000."}</small>
            </label>
          </div>
          <LocalizedCatalogDescriptionFields
            previewMode="toggle"
            description={product.description}
            descriptionEn={product.descriptionEn}
            entities={product.descriptionEntities}
            entitiesEn={product.descriptionEntitiesEn}
          />
        </AdminFormSection>
        </section>
        <section className="product-editor-panel" data-editor-tab="media" role="tabpanel" id={`${tabId}-media-panel`} aria-labelledby={`${tabId}-media`} hidden={activeTab !== "media"}>
<AdminFormSection
          eyebrow="Media produk"
          icon={<ImageIcon aria-hidden="true" />}
          status={product.imageUrl || product.attachmentOriginalFilename ? "Sudah diatur" : "Opsional"}
          title="Gambar dan file bonus"
          description="Gambar tampil di katalog. Lampiran hanya dikirim kepada pembeli produk ini."
        >
          <ProductMediaFields
            attachmentOriginalFilename={product.attachmentOriginalFilename}
            imageUrl={product.imageUrl}
            onRemovalChange={setRemovals}
          />
        </AdminFormSection>
<AdminFormSection
          className="is-wide"
          eyebrow="Setelah pengiriman"
          icon={<BookOpenCheck aria-hidden="true" />}
          status={product.postDeliveryInstructions || product.redeemUrl || product.attachmentOriginalFilename ? "Sudah diatur" : "Opsional"}
          title="Panduan privat pembeli"
          description="Pisahkan instruksi redeem dari deskripsi publik agar informasi pembeli tidak pernah masuk katalog atau channel."
        >
          <ProductPostDeliveryFields
            entities={product.postDeliveryEntities}
            instructions={product.postDeliveryInstructions}
            redeemUrl={product.redeemUrl}
          />
        </AdminFormSection>
        </section>
        <section className="product-editor-panel" data-editor-tab="settings" role="tabpanel" id={`${tabId}-settings-panel`} aria-labelledby={`${tabId}-settings`} hidden={activeTab !== "settings"}>
<AdminFormSection
          eyebrow="Struktur katalog"
          icon={<FolderTree aria-hidden="true" />}
          status={selectedGroupName ?? "Standalone"}
          title="Grup dan posisi varian"
          description="Gunakan parent untuk mengelompokkan K12, Team, Codex Free, atau varian lain tanpa mencampur stok."
        >
          <div className="split-fields">
            <label>
              Grup produk opsional
              <select name="groupId" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                <option value="">Produk standalone</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>{group.name}{group.status === "INACTIVE" ? " (nonaktif)" : ""}</option>
                ))}
              </select>
            </label>
            <label>
              Nama varian
              <input
                defaultValue={product.variantLabel ?? ""}
                disabled={!selectedGroupId}
                minLength={2}
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
              defaultValue={product.groupSortOrder}
              disabled={!selectedGroupId}
              max="1000000"
              min="-1000000"
              name="groupSortOrder"
              type="number"
            />
            <small>Angka lebih kecil tampil lebih dahulu. Produk tanpa grup tetap tampil sendiri di katalog.</small>
          </label>
        </AdminFormSection>
<AdminFormSection
          className="is-wide"
          eyebrow="Ketersediaan"
          icon={<Clock3 aria-hidden="true" />}
          status={preorderEnabled ? "Aktif" : "Nonaktif"}
          title="Preorder saat stok habis"
          description="Preorder hanya dibuka ketika tidak ada stok sehat yang siap dijual."
        >
          <label className="checkbox-row">
            <input checked={preorderEnabled} onChange={event => setPreorderEnabled(event.target.checked)} name="preorderEnabled" type="checkbox" />
            <span>Aktifkan preorder ketika stok sehat habis</span>
          </label>
          <div className="split-fields">
            <label>
              Estimasi preorder
              <input defaultValue={product.preorderEtaText ?? ""} disabled={!preorderEnabled} required={preorderEnabled} minLength={2} maxLength={120} name="preorderEtaText" placeholder="1-3 hari" />
            </label>
            <label>
              Batas antrean
              <input defaultValue={product.preorderLimit ?? ""} disabled={!preorderEnabled} required={preorderEnabled} max="10000" min="1" name="preorderLimit" placeholder="20" type="number" />
            </label>
          </div>
        </AdminFormSection>
        </section>
      </div>
      <aside className="product-save-bar product-editor-summary" aria-label="Ringkasan produk">
        <p className="product-summary-label">Ringkasan produk</p>
        <h2>{draftName.trim() || "Produk baru"}</h2>
        <p className="product-summary-price">{price ? `Rp ${Number(price).toLocaleString("id-ID")}` : "Harga belum diisi"}<small>per unit</small></p>
        <dl><div><dt>Grup</dt><dd>{selectedGroupName ?? "Tanpa grup"}</dd></div><div><dt>Preorder</dt><dd>{preorderEnabled ? "Aktif" : "Nonaktif"}</dd></div></dl>
        <div>

          <span>{dirty ? "Ada perubahan yang belum disimpan." : editing ? "Periksa detail produk sebelum menyimpan." : "Setelah disimpan, lanjutkan dengan mengisi stok."}</span>
        </div>
        <button className="button button-primary" disabled={submitting} type="submit">
          <Save aria-hidden="true" size={18} />
          {submitting ? "Sedang menyimpan..." : editing ? "Simpan perubahan" : "Buat produk"}
        </button>
      </aside>
      </form>
      <AdminDialog
        className="confirm-modal"
        description="Konfirmasi penyimpanan seluruh perubahan produk."
        dismissable={!submitting}
        eyebrow="Konfirmasi produk"
        layer="nested"
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={editing ? "Simpan perubahan produk?" : "Buat produk baru?"}
      >
        <dl className="product-confirm-summary"><div><dt>Produk</dt><dd>{review.name}</dd></div><div><dt>Harga per unit</dt><dd>Rp {review.price}</dd></div><div><dt>Grup</dt><dd>{review.group}</dd></div></dl>
        {!editing ? <p>Produk akan dibuat aktif. Jika grupnya aktif, pengumuman produk juga disiapkan untuk pelanggan Telegram.</p> : null}
        <p>
          Harga dan relasi grup baru hanya berlaku untuk checkout berikutnya. Snapshot order lama tetap aman.
          {removals.image || removals.attachment
            ? ` ${removals.image ? "Gambar lama akan dihapus. " : ""}${removals.attachment ? "Panduan/lampiran lama akan dihapus." : ""}`
            : ""}
        </p>
        <div className="admin-modal-actions">
          <button className="button button-primary" disabled={submitting} type="button" onClick={confirmSubmit}><Save aria-hidden="true" size={17} /> Ya, simpan</button>
          <button className="button button-ghost" type="button" onClick={() => setConfirmOpen(false)}>Periksa lagi</button>
        </div>
      </AdminDialog>
      <AdminResultModal
        message={`${submitError ?? ""} Semua perubahan pada halaman ini tetap tersimpan di form. Perbaiki bagian yang salah lalu coba lagi.`}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSubmitError(null);
        }}
        open={Boolean(submitError)}
        tone="error"
      />
      {submitting ? (
        <AdminProcessingOverlay
          title={editing ? "Perubahan produk sedang disimpan" : "Produk baru sedang dibuat"}
          description="Detail, media, panduan, relasi grup, dan pengaturan varian sedang diperbarui."
        />
      ) : null}
    </>
  );
}
