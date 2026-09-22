"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { AdminDialog } from "@/components/admin/admin-dialog";

export function AdminResultModal({
  message,
  tone,
  title,
  eyebrow,
  open,
  onOpenChange,
}: {
  message: string;
  tone: "success" | "error";
  title?: string;
  eyebrow?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(true);
  const isOpen = open ?? internalOpen;
  const Icon = tone === "success" ? CheckCircle2 : CircleAlert;

  function setOpen(nextOpen: boolean) {
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <AdminDialog
      className="result-modal"
      description={message}
      eyebrow={eyebrow ?? (tone === "success" ? "Berhasil" : "Gagal")}
      icon={(
        <span className={`result-modal-icon result-${tone}`}>
          <Icon aria-hidden="true" size={30} />
        </span>
      )}
      layer="result"
      onOpenChange={setOpen}
      open={isOpen}
      title={title ?? (tone === "success" ? "Perubahan disimpan" : "Tidak dapat diproses")}
    >
      <p role={tone === "error" ? "alert" : "status"}>{message}</p>
      <button className="button button-primary" type="button" onClick={() => setOpen(false)}>
        Tutup
      </button>
    </AdminDialog>
  );
}
