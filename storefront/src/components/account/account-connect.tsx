"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/cart-context";

const errors: Record<string, string> = {
  account_unavailable: "Akun belanja belum dapat dihubungkan. Coba kembali nanti.",
  email_verification_required: "Tambahkan dan verifikasi email utama di profil akunmu terlebih dahulu.",
  account_link_required: "Email ini memiliki pesanan lama. Masukkan password checkout lama untuk menghubungkannya.",
  invalid_credentials: "Password lama tidak sesuai atau akun sedang dikunci sementara. Coba lagi nanti.",
  rate_limited: "Terlalu banyak percobaan. Tunggu beberapa menit sebelum mencoba lagi.",
  sign_in_required: "Sesi login berakhir. Silakan masuk kembali.",
};

export function AccountConnect({ enabled, signedIn, initialCode }: { enabled: boolean; signedIn: boolean; initialCode?: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState(initialCode ?? "");
  const [linking, setLinking] = useState(false);
  const [pending, setPending] = useState(false);
  const { refresh, hydrated, error: cartError, errorCode: cartCode } = useCart();
  const activeCode = !code || code === "account_setup_required" ? cartCode ?? code : code;
  const needsPassword = linking || activeCode === "account_link_required" || activeCode === "invalid_credentials";
  const errorMessage = activeCode && activeCode !== "account_setup_required" ? errors[activeCode] ?? errors.account_unavailable : null;
  if (!enabled) return <section className="account-card"><h2>Akun belanja sedang disiapkan</h2><p>Penghubung akun dan saldo belum diaktifkan. Pesanan sebelumnya masih dapat dibuka lewat halaman Pesanan.</p><Link className="button button-quiet" href="/orders">Buka pesanan</Link></section>;
  if (!signedIn) return <section className="account-card"><h2>Masuk untuk melihat akunmu</h2><p>Pesanan, produk yang dibeli, dan saldo refund tersimpan dalam akun belanjamu.</p><Link className="button button-primary" href="/sign-in?redirect_url=%2Faccount">Masuk akun</Link></section>;
  if (!hydrated && !cartError && !needsPassword) return <section className="account-card" aria-busy="true"><h2>Menyiapkan akun belanjamu</h2><p>Tunggu sebentar. Akun belanjamu disiapkan otomatis menggunakan email yang sudah diverifikasi.</p></section>;
  return <section className="account-card"><h2>{needsPassword ? "Verifikasi akun belanja lama" : "Siapkan akun belanjamu"}</h2><p>{needsPassword ? "Email ini memiliki akun belanja sebelumnya. Masukkan password checkout lama agar pesanan dan saldonya tetap terlindungi." : "Akun belanja biasanya disiapkan otomatis. Kamu bisa mencoba kembali menggunakan email utama yang sudah diverifikasi."}</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (pending) return;
      setPending(true);
      try {
        const response = await fetch("/api/customer/account", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(needsPassword ? { legacyPassword: password } : {}) });
        const result = await response.json();
        if (!response.ok) { setCode(result.code ?? "account_unavailable"); return; }
        setPassword(""); await refresh(); router.refresh();
      } catch { setCode("account_unavailable"); } finally { setPending(false); }
    }}>
      {needsPassword ? <label className="account-password">Password checkout lama<input type="password" autoComplete="current-password" minLength={8} maxLength={64} required disabled={pending} value={password} onChange={event => setPassword(event.target.value)} /></label> : null}
      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      <button className="button button-primary" disabled={pending} type="submit">{pending ? "Menyiapkan..." : needsPassword ? "Verifikasi akun lama" : "Coba siapkan akun"}</button>
      {!needsPassword ? <button className="button button-quiet" type="button" disabled={pending} onClick={() => setLinking(true)}>Saya punya pesanan lama</button> : null}
    </form>
  </section>;
}
