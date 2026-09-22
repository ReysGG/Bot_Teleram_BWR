"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function ProductGroupDeleteForm({
  id,
  name,
  productCount,
}: {
  id: string;
  name: string;
  productCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (productCount > 0) {
    return <span className="muted">Lepaskan semua varian sebelum menghapus</span>;
  }

  return (
    <>
      <button className="button button-danger" type="button" onClick={() => setOpen(true)}>
        <Trash2 aria-hidden="true" size={17} /> Hapus grup
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div><p className="eyebrow">Permanent action</p><h2>Hapus grup?</h2></div>
              <button aria-label="Tutup modal" className="modal-close" type="button" onClick={() => setOpen(false)}>
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p>{name} akan dihapus permanen. Produk standalone dan riwayat order tidak berubah.</p>
            <div className="admin-modal-actions">
              <form action={`/api/admin/product-groups/${id}/delete`} method="post" onSubmit={() => setSubmitting(true)}>
                <button className="button button-danger" disabled={submitting} type="submit">
                  <Trash2 aria-hidden="true" size={17} /> Ya, hapus permanen
                </button>
              </form>
              <button className="button button-ghost" disabled={submitting} type="button" onClick={() => setOpen(false)}>Batal</button>
            </div>
          </section>
        </div>
      ) : null}
      {submitting ? <AdminProcessingOverlay title="Grup sedang dihapus" description="Validasi relasi produk sedang dijalankan." /> : null}
    </>
  );
}
