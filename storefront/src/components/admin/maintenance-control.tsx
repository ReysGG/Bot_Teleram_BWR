"use client";

import { useEffect, useId, useState } from "react";
import { Power, ShieldAlert, Wrench, X } from "lucide-react";

export function MaintenanceControl({
  enabled,
  message,
}: {
  enabled: boolean;
  message: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return (
    <>
      <section className={`maintenance-control${enabled ? " is-enabled" : ""}`}>
        <span className="maintenance-control-icon">
          {enabled ? (
            <ShieldAlert aria-hidden="true" size={24} />
          ) : (
            <Wrench aria-hidden="true" size={24} />
          )}
        </span>
        <div>
          <p className="eyebrow">Global checkout</p>
          <h2>{enabled ? "Maintenance aktif" : "Toko menerima order"}</h2>
          <p>
            {enabled
              ? message
              : "Aktifkan maintenance untuk menolak seluruh checkout baru dari bot."}
          </p>
        </div>
        <button
          className={`button ${enabled ? "button-light" : "button-danger"}`}
          type="button"
          onClick={() => setOpen(true)}
        >
          <Power aria-hidden="true" size={17} />
          {enabled ? "Buka checkout" : "Aktifkan maintenance"}
        </button>
      </section>

      {open ? (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <section
            aria-labelledby={titleId}
            aria-modal="true"
            className="admin-modal confirm-modal"
            role="dialog"
          >
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Store safety</p>
                <h2 id={titleId}>
                  {enabled ? "Buka checkout kembali?" : "Aktifkan maintenance?"}
                </h2>
              </div>
              <button
                aria-label="Tutup modal"
                className="modal-close"
                type="button"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <form action="/api/admin/maintenance" className="stack-form" method="post">
              <input name="enabled" type="hidden" value={enabled ? "false" : "true"} />
              {!enabled ? (
                <label>
                  Pesan untuk pembeli
                  <textarea
                    defaultValue={message}
                    maxLength={500}
                    name="message"
                    required
                    rows={4}
                  />
                </label>
              ) : null}
              <p className="fine-print">
                {enabled
                  ? "Order lama, pembayaran, delivery, dan refund tetap diproses. Hanya checkout baru yang dibuka kembali."
                  : "Checkout baru akan ditolak. Order lama, pembayaran aktif, delivery, dan admin tetap berjalan."}
              </p>
              <div className="admin-modal-actions">
                <button
                  className={`button ${enabled ? "button-primary" : "button-danger"}`}
                  type="submit"
                >
                  <Power aria-hidden="true" size={17} />
                  {enabled ? "Ya, buka checkout" : "Ya, aktifkan maintenance"}
                </button>
                <button
                  className="button button-ghost"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Batal
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}
