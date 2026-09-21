"use client";

import { useState } from "react";
import { EyeOff, Trash2, X } from "lucide-react";
import { productRemovalMode } from "@/server/products/removal";
import { AdminProcessingOverlay } from "@/components/admin/admin-processing-overlay";

export function ProductDeleteForm({
  id,
  name,
  status,
  stockCount,
  hasOrderHistory,
  hideDeactivate = false,
  returnTo = "/admin/products",
}: {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  stockCount: number;
  hasOrderHistory: boolean;
  hideDeactivate?: boolean;
  returnTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const mode = productRemovalMode({ hasOrderHistory, status });
  if (mode === "PROTECTED") {
    return <span className="muted">Nonaktif · histori dilindungi</span>;
  }

  const deactivate = mode === "DEACTIVATE";
  if (deactivate && hideDeactivate) return null;
  const action = deactivate
    ? `/api/admin/products/${id}/deactivate`
    : `/api/admin/products/${id}/delete`;

  return (
    <>
      <button
        className={`button button-small ${deactivate ? "button-ghost" : "button-danger"}`}
        type="button"
        onClick={() => setOpen(true)}
      >
        {deactivate ? <EyeOff aria-hidden="true" size={15} /> : <Trash2 aria-hidden="true" size={15} />}
        {deactivate ? "Nonaktifkan" : "Hapus"}
      </button>
      {open ? (
        <div className="admin-modal-backdrop" role="presentation">
          <section aria-modal="true" className="admin-modal confirm-modal" role="dialog">
            <div className="admin-modal-heading">
              <div>
                <p className="eyebrow">{deactivate ? "Protect order history" : "Permanent action"}</p>
                <h2>{deactivate ? "Nonaktifkan produk?" : "Hapus produk?"}</h2>
              </div>
              <button
                aria-label="Tutup modal"
                className="modal-close"
                disabled={submitting}
                type="button"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
            <p>
              {deactivate
                ? `${name} sudah memiliki riwayat order sehingga tidak boleh dihapus permanen. Produk akan disembunyikan dari katalog, sementara histori pembeli tetap aman.`
                : `${name} akan dihapus permanen bersama ${stockCount} stok yang belum pernah dipakai. Aksi ini tidak dapat dibatalkan.`}
            </p>
            <div className="admin-modal-actions">
              <form action={action} method="post" onSubmit={() => setSubmitting(true)}>
                <input name="returnTo" type="hidden" value={returnTo} />
                <button className={deactivate ? "button button-primary" : "button button-danger"} disabled={submitting} type="submit">
                  {deactivate ? <EyeOff aria-hidden="true" size={17} /> : <Trash2 aria-hidden="true" size={17} />}
                  {submitting ? "Memproses..." : deactivate ? "Ya, nonaktifkan" : "Ya, hapus permanen"}
                </button>
              </form>
              <button
                className="button button-ghost"
                disabled={submitting}
                type="button"
                onClick={() => setOpen(false)}
              >
                Batal
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {submitting ? (
        <AdminProcessingOverlay
          title={deactivate ? "Produk sedang dinonaktifkan" : "Produk sedang dihapus"}
          description={deactivate
            ? "Status katalog sedang disimpan tanpa mengubah histori transaksi."
            : "Sistem sedang memverifikasi perlindungan stok dan riwayat produk."}
        />
      ) : null}
    </>
  );
}
