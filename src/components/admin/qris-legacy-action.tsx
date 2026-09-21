"use client";

import { useId, useState } from "react";
import { Database, Power, PowerOff, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

const config = {
  use: { label: "Gunakan QRIS lama", title: "Pilih QRIS lama untuk checkout?", description: "Merchant vault yang sedang aktif akan dilepas. Invoice baru memakai QRIS DANA lama dari environment sampai Anda memilih merchant vault lain.", icon: Power },
  disable: { label: "Matikan QRIS lama", title: "Matikan QRIS lama?", description: "Fallback environment berhenti dipakai untuk invoice baru. Invoice lama tetap memakai snapshot saat dibuat.", icon: PowerOff },
  import: { label: "Impor ke vault", title: "Impor QRIS lama ke vault?", description: "Payload environment divalidasi, dienkripsi, disimpan sebagai merchant DANA aktif, lalu fallback lama dimatikan dalam satu transaksi.", icon: Database },
} as const;

export function QrisLegacyAction({ kind, disabled = false }: { kind: keyof typeof config; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const item = config[kind];
  const Icon = item.icon;
  return <>
    <button className={`button button-small ${kind === "disable" ? "button-danger" : "button-primary"}`} disabled={disabled || submitting} type="button" onClick={() => setOpen(true)}><Icon aria-hidden="true" size={15} /> {item.label}</button>
    {open ? <div className="admin-modal-backdrop" role="presentation"><section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
      <div className="admin-modal-heading"><div><p className="eyebrow">Konfirmasi QRIS legacy</p><h2 id={titleId}>{item.title}</h2></div><button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setOpen(false)}><X aria-hidden="true" size={20} /></button></div>
      <p>{item.description}</p>
      <form action={`/api/admin/payment-settings/qris/legacy/${kind}`} className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}><button className="button button-primary" disabled={submitting} type="submit"><Icon aria-hidden="true" size={16} /> {submitting ? "Memproses..." : "Ya, lanjutkan"}</button><button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button></form>
    </section></div> : null}
    {submitting ? <AdminProcessingOverlay title="Sumber QRIS sedang diperbarui" description="Sistem sedang mengunci routing checkout, memvalidasi payload, dan menyimpan audit perubahan." /> : null}
  </>;
}
