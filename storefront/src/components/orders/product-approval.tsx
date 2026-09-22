"use client";

import { useState } from "react";

export function ProductApproval({ invoice }: { invoice: string }) {
  const [state, setState] = useState<"idle" | "sending" | "approved" | "error">("idle");

  async function approve() {
    setState("sending");
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(invoice)}/delivery-approval`, { method: "POST" });
      if (!response.ok) throw new Error("approval_failed");
      setState("approved");
    } catch {
      setState("error");
    }
  }

  if (state === "approved") return <div className="order-approval-success" role="status">Produk sudah dikonfirmasi bisa digunakan. Saldo seller diproses sesuai policy.</div>;
  return <div className="order-approval-panel"><strong>Produk sudah kamu terima?</strong><p>Tekan tombol ini hanya setelah produk bisa digunakan. Ini membantu melepaskan saldo seller; rating produk atau seller tetap opsional.</p><button className="button button-primary" disabled={state === "sending"} onClick={() => void approve()}>{state === "sending" ? "Menyimpan..." : "Produk bisa digunakan"}</button>{state === "error" ? <small role="alert">Konfirmasi belum tersimpan. Coba lagi setelah memuat ulang.</small> : null}</div>;
}
