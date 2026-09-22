"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { AdminResultModal } from "@/components/admin/admin-result-modal";
import { submitAdminForm } from "@/components/admin/submit-admin-form";
import { productStatusErrorMessage } from "@/lib/admin-product-status-errors";

export function ProductStatusAction({
  id,
  name,
  status,
  returnTo,
  failureReturnTo,
  compact = true,
}: {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  returnTo: string;
  failureReturnTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const activating = status === "INACTIVE";
  const targetStatus = activating ? "ACTIVE" : "INACTIVE";
  const Icon = activating ? Eye : EyeOff;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = formRef.current;
    if (!form || submitting) return;

    setSubmitting(true);
    setSubmitError(null);
    setOpen(false);
    try {
      const result = await submitAdminForm(form);
      if (!result.ok) {
        setSubmitError(productStatusErrorMessage(result.error, activating));
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
      router.push(result.redirectTo);
      router.refresh();
    } catch {
      setSubmitError(productStatusErrorMessage("network", activating));
      setSubmitting(false);
    }
  }

  return (
    <>
      <AdminDialog
        className="confirm-modal"
        description={activating
          ? "Konfirmasi untuk menampilkan kembali produk di katalog."
          : "Konfirmasi untuk menutup produk dari katalog dan checkout baru."}
        dismissable={!submitting}
        eyebrow="Status katalog"
        layer="nested"
        onOpenChange={setOpen}
        open={open}
        title={activating ? "Aktifkan produk?" : "Nonaktifkan produk?"}
        trigger={(
          <button
            className={`button ${compact ? "button-small " : ""}button-ghost`}
            disabled={submitting}
            type="button"
          >
            <Icon aria-hidden="true" size={compact ? 15 : 17} />
            {activating ? "Aktifkan" : "Nonaktifkan"}
          </button>
        )}
      >
        <p>
          {activating
            ? `${name} akan kembali tersedia di katalog selama parent produknya juga aktif.`
            : `${name} akan langsung disembunyikan dari katalog dan checkout baru. Stok, order, invoice yang sudah dibuat, serta riwayat pengiriman tetap tersimpan.`}
        </p>
        <form
          ref={formRef}
          action={`/api/admin/products/${id}/status`}
          className="admin-modal-actions"
          method="post"
          onSubmit={handleSubmit}
        >
          <input name="status" type="hidden" value={targetStatus} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <input name="failureReturnTo" type="hidden" value={failureReturnTo ?? returnTo} />
          <button className="button button-primary" disabled={submitting} type="submit">
            <Icon aria-hidden="true" size={17} />
            {submitting ? "Memproses..." : activating ? "Ya, aktifkan" : "Ya, nonaktifkan"}
          </button>
          <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button>
        </form>
      </AdminDialog>
      <AdminResultModal
        message={submitError ?? ""}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setSubmitError(null);
        }}
        open={Boolean(submitError)}
        tone="error"
      />
      {submitting ? (
        <AdminProcessingOverlay
          title={activating ? "Produk sedang diaktifkan" : "Produk sedang dinonaktifkan"}
          description="Status katalog sedang disimpan. Riwayat transaksi tidak diubah."
        />
      ) : null}
    </>
  );
}
