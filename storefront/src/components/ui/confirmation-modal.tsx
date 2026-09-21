"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

export function ConfirmationModal({ open, title, children, pending = false, confirmLabel = "Lanjutkan", cancelLabel = "Batal", icon = "wallet", onCancel, onConfirm }: {
  open: boolean; title: string; children: ReactNode; pending?: boolean; confirmLabel?: string; cancelLabel?: string; icon?: IconName;
  onCancel: () => void; onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) { dialog.current?.showModal(); cancel.current?.focus(); }
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return <dialog className="store-confirm-modal" ref={dialog} aria-labelledby={id} aria-busy={pending}
    onCancel={event => { event.preventDefault(); if (!pending) onCancel(); }}>
    <div className="store-confirm-icon"><Icon name={icon} size={26} aria-hidden="true" /></div>
    <h2 id={id}>{title}</h2>
    <div className="store-confirm-content">{children}</div>
    <div className="store-confirm-actions"><button className="button button-quiet" ref={cancel} disabled={pending} type="button" onClick={onCancel}>{cancelLabel}</button><button className="button button-primary" disabled={pending} type="button" onClick={onConfirm}>{pending ? "Memproses..." : confirmLabel}</button></div>
  </dialog>;
}
