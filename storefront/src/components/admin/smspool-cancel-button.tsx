"use client";

import { useId, useState } from "react";
import { Ban, X } from "lucide-react";

export function SmsPoolCancelButton({
  orderId,
  refundsWallet = false,
}: {
  orderId: string;
  refundsWallet?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  return (
    <>
      <button className="button button-small button-ghost" onClick={() => setOpen(true)} type="button">
        <Ban aria-hidden="true" size={15} />
        Cancel
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Cancel SMSPool</p>
                <h2 id={titleId}>Batalkan nomor ini?</h2>
              </div>
              <button aria-label="Tutup modal" className="modal-close" onClick={() => setOpen(false)} type="button">
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p>
              {refundsWallet
                ? "Nomor akan dibatalkan di provider dan harga jual dikembalikan ke wallet user. Refund hanya diproses satu kali."
                : "Provider hanya memberi refund jika order masih memenuhi syarat pembatalan."}
            </p>
            <form action={`/api/admin/smspool/orders/${encodeURIComponent(orderId)}/cancel`} method="post">
              <div className="admin-modal-actions">
                <button className="button button-danger" type="submit">
                  <Ban aria-hidden="true" size={16} />
                  {refundsWallet ? "Ya, cancel & refund wallet" : "Ya, cancel & minta refund"}
                </button>
                <button className="button button-ghost" onClick={() => setOpen(false)} type="button">Kembali</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
