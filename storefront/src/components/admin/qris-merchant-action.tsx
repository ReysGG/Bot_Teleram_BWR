"use client";

import { useId, useState } from "react";
import { Archive, CheckCircle2, Power, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function QrisMerchantAction({
  action,
  kind,
  merchantName,
  returnTo,
  disabled = false,
  disabledReason,
}: {
  action: string;
  kind: "activate" | "archive";
  merchantName: string;
  returnTo: string;
  disabled?: boolean;
  disabledReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const activate = kind === "activate";
  const Icon = activate ? Power : Archive;

  return (
    <>
      <button
        className={`button button-small ${activate ? "button-primary" : "button-danger"}`}
        disabled={disabled || submitting}
        title={disabled ? disabledReason ?? undefined : undefined}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Icon aria-hidden="true" size={15} /> {activate ? "Pilih untuk checkout" : "Arsipkan"}
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Konfirmasi QRIS</p>
                <h2 id={titleId}>{activate ? "Ganti merchant checkout aktif?" : "Arsipkan merchant QRIS?"}</h2>
              </div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>
              {activate
                ? <><CheckCircle2 aria-hidden="true" size={18} /> Invoice QRIS baru akan memakai <strong>{merchantName}</strong>. Invoice lama tetap memakai snapshot merchant sebelumnya.</>
                : <>Merchant <strong>{merchantName}</strong> akan dinonaktifkan dan disembunyikan dari checkout baru. Riwayat invoice tetap dipertahankan.</>}
            </p>
            <form action={action} className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <button className={`button ${activate ? "button-primary" : "button-danger"}`} disabled={submitting} type="submit">
                <Icon aria-hidden="true" size={16} /> {submitting ? "Memproses..." : activate ? "Ya, jadikan aktif" : "Ya, arsipkan"}
              </button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}
      {submitting ? (
        <AdminProcessingOverlay
          title={activate ? "Merchant QRIS sedang diaktifkan" : "Merchant QRIS sedang diarsipkan"}
          description={activate
            ? "Sistem sedang memvalidasi payload dan package provider sebelum mengganti merchant checkout."
            : "Sistem sedang menutup merchant untuk checkout baru tanpa menghapus riwayat invoice."}
        />
      ) : null}
    </>
  );
}
