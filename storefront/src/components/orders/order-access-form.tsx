"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function OrderAccessForm({
  initialIdentifier = "",
  returnTo,
}: {
  initialIdentifier?: string;
  returnTo?: string;
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/customer/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = await response.json() as { ok?: boolean; code?: string };
      if (!response.ok || !result.ok) {
        setError(result.code === "rate_limited"
          ? "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."
          : result.code === "invalid_credentials"
            ? "Email, kode invoice, atau password tidak cocok."
            : "Pesanan belum dapat dibuka. Coba lagi sebentar lagi.");
        return;
      }
      if (returnTo) router.replace(returnTo);
      router.refresh();
    } catch {
      setError("Koneksi bermasalah. Periksa internet lalu coba lagi.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="order-access-form" onSubmit={submit}>
      <label>
        <span>Email atau kode invoice</span>
        <input autoComplete="email" maxLength={254} placeholder="contoh@email.com atau TGS-..." required value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
      </label>
      <label>
        <span>Password pesanan</span>
        <input autoComplete="current-password" maxLength={64} minLength={8} placeholder="Password yang dibuat saat checkout" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={submitting} type="submit">{submitting ? "Memeriksa..." : "Cari pesanan"}</button>
      <p className="form-helper">Gunakan password yang sama dengan yang kamu buat ketika checkout.</p>
    </form>
  );
}
