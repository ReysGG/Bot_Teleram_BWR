"use client";

import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/ui/icon";

export function CopyInvoiceButton({ invoiceNumber }: { invoiceNumber: string }) {
  const [message, setMessage] = useState("");
  return <span className="invoice-copy"><button type="button" aria-label="Salin nomor invoice" onClick={async () => {
    try { await navigator.clipboard.writeText(invoiceNumber); setMessage("Tersalin"); }
    catch { setMessage("Belum tersalin. Salin nomor secara manual."); }
  }}><Icon name="copy" size={15} /></button><span role="status">{message}</span></span>;
}

export function RefreshOrderButton({ invoiceNumber }: { invoiceNumber: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <div className="order-refresh-action"><button className="button button-quiet" disabled={pending} type="button" onClick={() => startTransition(async () => {
    setError("");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(invoiceNumber)}/payment-refresh`, { method: "POST" });
      if (!response.ok) throw new Error("refresh failed");
      router.refresh();
    } catch { setError("Status belum dapat diperiksa. Coba lagi."); }
  })}>{pending ? "Memeriksa..." : "Refresh status"}</button>{error ? <p role="alert">{error}</p> : null}</div>;
}

export function LogoutOrderAccessButton({ accountMode = false }: { accountMode?: boolean }) {
  const clerk = useClerk();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button className="order-logout" disabled={pending} type="button" onClick={async () => {
      if (pending) return;
      setPending(true);
      try {
        await fetch("/api/customer/logout", { method: "POST" });
        if (accountMode) { await clerk.signOut({ redirectUrl: "/sign-in" }); return; }
        router.replace("/orders");
        router.refresh();
      } finally {
        setPending(false);
      }
    }}>{pending ? "Menutup..." : "Keluar dari pesanan"}</button>
  );
}

export function ConfirmLocalTestPaymentButton({ invoiceNumber }: { invoiceNumber: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="test-payment-action">
      <button className="button button-quiet" disabled={pending} type="button" onClick={async () => {
        if (pending) return;
        setPending(true);
        setError(null);
        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(invoiceNumber)}/test-confirm`, { method: "POST" });
          if (!response.ok) throw new Error("confirmation failed");
          router.refresh();
        } catch {
          setError("Simulasi pembayaran gagal.");
        } finally {
          setPending(false);
        }
      }}>{pending ? "Mengonfirmasi..." : "Simulasikan pembayaran lokal"}</button>
      {error ? <span>{error}</span> : null}
    </div>
  );
}

export function CancelOrderButton({ invoiceNumber }: { invoiceNumber: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  async function cancelInvoice() {
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(invoiceNumber)}/cancel`, { method: "POST" });
      if (!response.ok) throw new Error("cancel failed");
      router.refresh();
    } catch { setError("Invoice tidak dapat dibatalkan."); }
    finally { inFlight.current = false; setPending(false); setOpen(false); }
  }
  return <div className="cancel-order-action"><button className="button button-quiet" disabled={pending} type="button" onClick={() => setOpen(true)}>{pending ? "Membatalkan..." : "Batalkan invoice"}</button>
    {error ? <span role="alert">{error}</span> : null}
    <ConfirmationModal open={open} title="Batalkan invoice ini?" icon="receipt" confirmLabel="Ya, batalkan" cancelLabel="Kembali" pending={pending} onCancel={() => setOpen(false)} onConfirm={() => void cancelInvoice()}>
      <p>Invoice <strong>{invoiceNumber}</strong> yang dibatalkan tidak dapat dibayar lagi.</p>
    </ConfirmationModal>
  </div>;
}
