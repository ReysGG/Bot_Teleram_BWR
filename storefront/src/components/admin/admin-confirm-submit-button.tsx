"use client";

import { useId, useState } from "react";
import { CircleAlert, LoaderCircle, X } from "lucide-react";

export function AdminConfirmSubmitButton({
  children,
  confirmText,
  description,
  formId,
  title,
  className = "button button-primary",
}: {
  children: React.ReactNode;
  confirmText: string;
  description: string;
  formId?: string;
  title: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();

  function submit() {
    const form = formId
      ? document.getElementById(formId) as HTMLFormElement | null
      : document.activeElement?.closest("form") as HTMLFormElement | null;
    if (!form || submitting) return;
    if (!form.reportValidity()) return;
    setSubmitting(true);
    form.requestSubmit();
  }

  return (
    <>
      <button className={className} disabled={submitting} type="button" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Konfirmasi tindakan</p>
                <h2 id={titleId}>{title}</h2>
              </div>
              <button aria-label="Tutup modal" className="modal-close" type="button" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p><CircleAlert aria-hidden="true" size={18} /> {description}</p>
            <div className="admin-modal-actions">
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button>
              <button className="button button-primary" disabled={submitting} type="button" onClick={submit}>
                {submitting ? <><LoaderCircle aria-hidden="true" className="admin-processing-spinner" size={16} /> Memproses...</> : confirmText}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
