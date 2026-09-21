"use client";

import { useAuth } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./login-feedback.module.css";

const markerKey = "bwr-login-feedback";
const markerLifetime = 5 * 60_000;

export function LoginFeedback() {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const authPage = /^\/sign-(in|up)(\/|$)/.test(pathname);
  const previousSignedIn = useRef<boolean | undefined>(undefined);
  const [success, setSuccess] = useState<"login" | "register" | null>(null);

  useEffect(() => {
    // This timestamp is presentation-only and survives Clerk's hard redirect.
    // No identity, credentials or destination URL are stored here.
    if (authPage && !isSignedIn) {
      try { sessionStorage.setItem(markerKey, JSON.stringify({ at: Date.now(), mode: pathname.startsWith("/sign-up") ? "register" : "login" })); } catch { /* Optional storage. */ }
    }
    if (!isLoaded) return;
    let pendingLogin = false;
    let mode: "login" | "register" = pathname.startsWith("/sign-up") ? "register" : "login";
    if (isSignedIn) {
      try {
        const recorded = JSON.parse(sessionStorage.getItem(markerKey) ?? "null") as { at?: number; mode?: string } | null;
        const age = Date.now() - (recorded?.at ?? 0);
        pendingLogin = Boolean(recorded?.at) && age >= 0 && age < markerLifetime;
        if (pendingLogin && recorded?.mode === "register") mode = "register";
      } catch { /* Same-document login still works without storage. */ }
    }
    const justSignedIn = Boolean(isSignedIn) && (previousSignedIn.current === false || pendingLogin);
    if (!justSignedIn) { previousSignedIn.current = Boolean(isSignedIn); return; }
    const show = window.setTimeout(() => {
      previousSignedIn.current = true;
      try { sessionStorage.removeItem(markerKey); } catch { /* Optional storage. */ }
      setSuccess(mode);
    }, 0);
    return () => window.clearTimeout(show);
  }, [isLoaded, isSignedIn, authPage, pathname]);

  useEffect(() => {
    if (!success) return;
    const dismiss = window.setTimeout(() => setSuccess(null), 1500);
    return () => window.clearTimeout(dismiss);
  }, [success]);

  const preparing = authPage && !isLoaded;
  if (!success && !preparing) return null;
  return <div className={styles.overlay} role="status" aria-live="polite" aria-atomic="true">
    <div className={styles.card}>
      {success ? <svg className={styles.check} viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="36" /><path d="m23 40 11 11 23-24" /></svg>
        : <span className={styles.spinner} aria-hidden="true" />}
      <strong>{success === "register" ? "Akun berhasil dibuat" : success ? "Berhasil masuk" : "Menyiapkan akun"}</strong>
      <p>{success === "register" ? "Selamat datang! Menyiapkan halamanmu…" : success ? "Selamat datang kembali! Menyiapkan halamanmu…" : "Tunggu sebentar, formulir sedang dimuat…"}</p>
    </div>
  </div>;
}
