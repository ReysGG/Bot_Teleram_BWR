"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function PaymentReferenceForm({ type, invoice }: { type: "BINANCE_INTERNAL" | "USDT_BEP20"; invoice: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = type === "BINANCE_INTERNAL" ? "Order ID Binance" : "Hash transaksi BNB Chain";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !value.trim()) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(invoice)}/payment-reference`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value }),
      });
      if (!response.ok) throw new Error("rejected");
      setValue("");
      router.refresh();
    } catch {
      setError("Referensi pembayaran belum dapat diterima. Periksa kembali lalu coba lagi.");
    } finally {
      setPending(false);
    }
  }
  return <form className="payment-reference-form" onSubmit={submit}><label><span>{label}</span><input maxLength={180} placeholder={type === "BINANCE_INTERNAL" ? "Masukkan Order ID" : "0x..."} required value={value} onChange={(event) => setValue(event.target.value)} /></label><button className="button button-primary" disabled={pending} type="submit">{pending ? "Memeriksa..." : "Kirim referensi"}</button>{error ? <p className="form-error" role="alert">{error}</p> : null}</form>;
}
