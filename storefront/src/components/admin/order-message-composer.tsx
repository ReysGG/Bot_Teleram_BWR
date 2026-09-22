"use client";

import { useId, useRef, useState } from "react";
import { Send, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";
import { TelegramRichTextEditor } from "@/components/admin/telegram-rich-text-editor";

export function OrderMessageComposer({
  action,
  invoice,
  productName,
}: {
  action: string;
  invoice: string;
  productName: string;
}) {
  const [message, setMessage] = useState("");
  const [templateText, setTemplateText] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const titleId = useId();
  const templates = [
    `Halo, pesanan ${invoice} untuk ${productName} sedang kami proses. Mohon tunggu sebentar ya.`,
    `Update pesanan ${invoice}: stok sedang disiapkan dan akan dikirim otomatis setelah tersedia.`,
    `Pesanan ${invoice} sudah kami periksa. Silakan cek kembali pesan dan file terbaru dari bot.`,
  ];

  return (
    <form ref={formRef} action={action} className="stack-form" method="post" onSubmit={(event) => {
      event.preventDefault();
      setConfirmOpen(true);
    }}>
      <div className="admin-inline-actions">
        {templates.map((template, index) => (
          <button className="button button-small button-ghost" key={index} type="button" onClick={() => {
            setTemplateText(template);
            setMessage(template);
          }}>
            Template {index + 1}
          </button>
        ))}
      </div>
      <TelegramRichTextEditor
        key={templateText}
        entitiesName="messageEntities"
        initialText={templateText}
        label="Isi pesan"
        maxLength={2000}
        name="message"
        placeholder="Tulis pesan atau pilih template cepat."
        required
        onChange={(value) => setMessage(value.text)}
      />
      <button className="button button-primary" disabled={submitting} type="submit"><Send aria-hidden="true" size={17} /> {submitting ? "Sedang mengantrekan..." : "Kirim lewat Telegram"}</button>
      {confirmOpen ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section aria-labelledby={titleId} aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Konfirmasi pesan</p><h2 id={titleId}>Kirim pesan ke pembeli?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" type="button" onClick={() => setConfirmOpen(false)}><X aria-hidden="true" size={20} /></button>
            </div>
            <p>{message}</p>
            <div className="admin-modal-actions">
              <button className="button button-ghost" type="button" onClick={() => setConfirmOpen(false)}>Edit lagi</button>
              <button className="button button-primary" disabled={submitting} type="button" onClick={() => {
                setSubmitting(true);
                setConfirmOpen(false);
                formRef.current?.submit();
              }}>Ya, kirim pesan</button>
            </div>
          </section>
        </div>
      ) : null}
      {submitting ? (
        <AdminProcessingOverlay
          title="Pesan sedang diantrekan"
          description={`Pesan untuk invoice ${invoice} sedang disimpan ke outbox Telegram.`}
        />
      ) : null}
    </form>
  );
}
