"use client";

import { useState } from "react";
import { Megaphone } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";

export function BroadcastCreateForm({ subscriberCount }: { subscriberCount: number }) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <>
      <form action="/api/admin/broadcasts" className="stack-form" method="post" onSubmit={() => setSubmitting(true)}>
        <label>Judul<input maxLength={120} minLength={3} name="title" placeholder="Contoh: Maintenance malam ini" required /></label>
        <TelegramRichTextEditor entitiesName="messageEntities" label="Isi pengumuman" maxLength={3000} minLength={3} name="message" placeholder="Tulis informasi yang akan diterima pengguna Telegram." required />
        <p className="fine-print">Pengumuman akan masuk antrean untuk {subscriberCount} pengguna yang masih mengaktifkan notifikasi, lalu dikirim oleh notification worker.</p>
        <div className="admin-modal-actions"><button className="button button-primary" disabled={submitting || subscriberCount === 0} type="submit"><Megaphone aria-hidden="true" size={18} /> {submitting ? "Sedang mengantrekan..." : "Antrekan broadcast"}</button></div>
      </form>
      {submitting ? <AdminProcessingOverlay title="Pengumuman sedang diantrekan" description="Sistem sedang menyiapkan broadcast dan memulai worker pengiriman." /> : null}
    </>
  );
}
