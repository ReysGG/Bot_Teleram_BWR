"use client";

import { useState } from "react";
import { BadgeCheck } from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function PaymentReconciliationForm({
  eventId,
  targetId,
  targetKind,
  invoiceNumber,
  late,
  returnTo,
}: {
  eventId: string;
  targetId: string;
  targetKind: "order" | "wallet_topup";
  invoiceNumber: string;
  late: boolean;
  returnTo: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const formId = `reconcile-${eventId}-${targetId}`;

  return (
    <>
      <form
        action={`/api/admin/payment-events/${encodeURIComponent(eventId)}/reconcile`}
        id={formId}
        method="post"
        onSubmit={() => setSubmitting(true)}
      >
        <input name="targetId" type="hidden" value={targetId} />
        <input name="targetKind" type="hidden" value={targetKind} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <label htmlFor={`${formId}-reason`}>Catatan audit</label>
        <textarea
          id={`${formId}-reason`}
          maxLength={500}
          minLength={3}
          name="reason"
          placeholder="Contoh: mutasi DANA cocok dengan invoice dan waktu pembayaran."
          required
          rows={3}
        />
        <AdminConfirmSubmitButton
          className="button button-small"
          confirmText={late ? "Kreditkan ke wallet" : "Konfirmasi pembayaran"}
          description={late
            ? `Transaksi ${invoiceNumber} sudah tidak aktif. Dana masuk akan dikreditkan ke wallet agar stok tidak terkirim secara tidak aman.`
            : `Event ini akan ditautkan ke ${invoiceNumber} dan pembayaran diproses satu kali.`}
          formId={formId}
          title={late ? "Rekonsiliasi pembayaran terlambat?" : "Konfirmasi kecocokan pembayaran?"}
        >
          <BadgeCheck aria-hidden="true" size={16} />
          {late ? "Kreditkan wallet" : "Pilih transaksi"}
        </AdminConfirmSubmitButton>
      </form>
      {submitting ? (
        <AdminProcessingOverlay
          description="Sistem sedang mengunci event, memeriksa nominal dan waktu, lalu mencatat audit idempotent."
          title="Merekonsiliasi pembayaran..."
        />
      ) : null}
    </>
  );
}
