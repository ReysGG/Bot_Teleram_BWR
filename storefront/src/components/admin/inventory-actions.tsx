"use client";

import Link from "next/link";
import {
  Archive,
  ChevronDown,
  Download,
  Eye,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { AdminConfirmSubmitButton } from "@/components/admin/admin-confirm-submit-button";

type InventoryStatus =
  | "AVAILABLE"
  | "RESERVED"
  | "DELIVERED"
  | "BANNED"
  | "DISABLED";

export function InventoryActions({
  id,
  status,
  archived,
  returnTo,
}: {
  id: string;
  status: InventoryStatus;
  archived: boolean;
  returnTo: string;
}) {
  const deletable = status !== "RESERVED" && status !== "DELIVERED";
  const editable = ["AVAILABLE", "BANNED", "DISABLED"].includes(status);
  const detailHref = {
    pathname: `/admin/inventory/${id}`,
    query: { returnTo },
  };

  return (
    <details className="inventory-action-menu">
      <summary aria-label={`Kelola stok ${id.slice(-8)}`}>
        <MoreHorizontal aria-hidden="true" size={16} />
        Kelola
        <ChevronDown aria-hidden="true" className="inventory-action-chevron" size={14} />
      </summary>
      <div className="inventory-action-menu-panel">
        <Link className="inventory-action-link" href={detailHref} prefetch={false}>
          <Eye aria-hidden="true" size={15} />
          Lihat detail
        </Link>
        <a className="inventory-action-link" href={`/api/admin/inventory/${id}/file`}>
          <Download aria-hidden="true" size={15} />
          Download
        </a>

        {editable ? (
          <Link className="inventory-action-link" href={`/admin/inventory/${id}/takeout`} prefetch={false}>
            <Download aria-hidden="true" size={15} />
            Ambil akun / email banned
          </Link>
        ) : null}

        {editable ? (
          <Link
            className="inventory-action-link"
            href={{
              pathname: `/admin/inventory/${id}/edit`,
              query: { returnTo },
            }}
            prefetch={false}
          >
            <Pencil aria-hidden="true" size={15} />
            Edit
          </Link>
        ) : null}

        {archived ? (
          <form action={`/api/admin/inventory/${id}/restore`} method="post">
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="inventory-action-link" type="submit">
              <RotateCcw aria-hidden="true" size={15} />
              Pulihkan
            </button>
          </form>
        ) : status === "RESERVED" ? (
          <p className="inventory-action-note">Terkunci oleh checkout aktif.</p>
        ) : (
          <>
            <form action={`/api/admin/inventory/${id}/check`} method="post">
              <input type="hidden" name="returnTo" value={returnTo} />
              <button className="inventory-action-link" type="submit">
                <RefreshCw aria-hidden="true" size={15} />
                Check akun
              </button>
            </form>
            <form action={`/api/admin/inventory/${id}/archive`} method="post">
              <input type="hidden" name="returnTo" value={returnTo} />
              <AdminConfirmSubmitButton
                className="inventory-action-link"
                confirmText="Ya, arsipkan"
                description="Stok dikeluarkan dari daftar aktif dan dapat dipulihkan dari Arsip."
                title="Arsipkan stok ini?"
              >
                <Archive aria-hidden="true" size={15} />
                Arsipkan
              </AdminConfirmSubmitButton>
            </form>
          </>
        )}

        {deletable ? (
          <form action={`/api/admin/inventory/${id}/delete`} method="post">
            <input type="hidden" name="returnTo" value={returnTo} />
            <AdminConfirmSubmitButton
              className="inventory-action-link is-danger"
              confirmText="Ya, hapus permanen"
              description="Credential terenkripsi tidak dapat dipulihkan setelah dihapus."
              title="Hapus stok ini?"
            >
              <Trash2 aria-hidden="true" size={15} />
              Hapus permanen
            </AdminConfirmSubmitButton>
          </form>
        ) : status === "DELIVERED" ? (
          <p className="inventory-action-note">Riwayat penjualan dilindungi.</p>
        ) : null}
      </div>
    </details>
  );
}
