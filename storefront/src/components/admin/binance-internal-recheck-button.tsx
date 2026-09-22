"use client";

import { useEffect, useId, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function BinanceInternalRecheckButton({
  attemptId,
  invoiceNumber,
  returnTo,
  submittedOrderId,
}: {
  attemptId: string;
  invoiceNumber: string;
  returnTo: string;
  submittedOrderId: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, submitting]);

  return (
    <>
      <button className="button button-small" type="button" onClick={() => setOpen(true)}><RefreshCw aria-hidden="true" size={16} /> Cek ulang</button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !submitting) setOpen(false);
        }}>
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Binance verifier</p><h2 id={titleId}>Periksa histori Binance sekarang?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" disabled={submitting} type="button" onClick={() => setOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>Invoice <strong>{invoiceNumber}</strong><br />Order ID <strong className="usdt-bep20-hash">{submittedOrderId}</strong></p>
            <p className="fine-print">Aksi ini hanya menjalankan verifier resmi. Admin tidak dapat menandai order lunas secara manual.</p>
            <form action={`/api/admin/binance-internal/${encodeURIComponent(attemptId)}/recheck`} className="admin-modal-actions" method="post" onSubmit={() => setSubmitting(true)}>
              <input name="returnTo" type="hidden" value={returnTo} />
              <button className="button button-primary" disabled={submitting} type="submit"><RefreshCw aria-hidden="true" size={17} /> {submitting ? "Memeriksa..." : "Ya, cek ulang"}</button>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button>
            </form>
          </section>
        </div>
      ) : null}
      {submitting ? <AdminProcessingOverlay title="Pembayaran sedang diperiksa" description="Verifier sedang mencocokkan Order ID, income USDT, penerima, nominal, dan waktu transaksi." /> : null}
    </>
  );
}
