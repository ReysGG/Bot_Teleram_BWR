"use client";

import { useEffect, useId, useState } from "react";
import { Megaphone, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";

export function BroadcastComposer({ subscriberCount }: { subscriberCount: number }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      <button className="button button-primary" type="button" onClick={() => setOpen(true)}>
        <Megaphone aria-hidden="true" size={18} />
        Buat pengumuman
      </button>
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
            className="admin-modal"
            role="dialog"
          >
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">Telegram broadcast</p>
                <h2 id={titleId}>Kirim pengumuman</h2>
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
            <form
              action="/api/admin/broadcasts"
              className="stack-form"
              method="post"
              onSubmit={() => setSubmitting(true)}
            >
              <label>
                Judul
                <input
                  maxLength={120}
                  minLength={3}
                  name="title"
                  placeholder="Contoh: Maintenance malam ini"
                  required
                />
              </label>
              <TelegramRichTextEditor
                entitiesName="messageEntities"
                label="Isi pengumuman"
                maxLength={3000}
                minLength={3}
                name="message"
                placeholder="Tulis informasi yang akan diterima pengguna Telegram."
                required
              />
              <p className="fine-print">
                Pesan akan masuk antrean untuk {subscriberCount} pengguna yang masih
                mengaktifkan notifikasi. Progres terkirim dan gagal dapat dipantau di halaman ini.
              </p>
              <div className="admin-modal-actions">
                <button className="button button-primary" disabled={subscriberCount === 0 || submitting} type="submit">
                  <Megaphone aria-hidden="true" size={18} />
                  {submitting ? "Sedang mengantrekan..." : "Antrekan broadcast"}
                </button>
                <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>
                  Batal
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
      {submitting ? (
        <AdminProcessingOverlay
          title="Pengumuman sedang diantrekan"
          description={`Sistem sedang menyiapkan broadcast untuk ${subscriberCount} penerima dan memulai worker pengiriman.`}
        />
      ) : null}
    </>
  );
}
