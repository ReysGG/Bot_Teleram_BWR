"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { PrivateFileDownload } from "./private-file-download";
import styles from "./order-login.module.css";
export function OrderLogin({ invoiceNumber }: { invoiceNumber: string }) {
  const [summary, setSummary] = useState<{ eligible: number; available: number; missing: number } | null>(null);
  const endpoint = `/api/orders/${encodeURIComponent(invoiceNumber)}/login`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (response.ok) setSummary(await response.json());
    }).catch(() => undefined);
    return () => controller.abort();
  }, [endpoint]);
  if (!summary?.eligible) return null;
  return <section className={styles.card} aria-labelledby="codex-login-title">
    <div className={styles.heading}><span className={styles.icon}><Icon name="shield-check" size={23} /></span><div><h2 id="codex-login-title">Data login Codex Free</h2><p>Download pasangan data login dari produk yang sudah kamu ambil, langsung di sini.</p></div></div>
    <div className={styles.action}><span>{summary.available} dari {summary.eligible} akun tersedia.</span><PrivateFileDownload key={endpoint} endpoint={endpoint} method="POST" filename="BWR-Codex-login.txt" label="Ambil data login" disabled={!summary.available} /></div>
    {summary.missing > 0 ? <p className={styles.warning}>{summary.missing} akun belum memiliki data login. Akun yang tersedia tetap bisa diunduh. <a href="https://t.me/davidboysaja" target="_blank" rel="noopener noreferrer">Hubungi bantuan</a></p> : null}
    <details className={styles.help}><summary>Cara mengambil data login di website</summary><p>Ambil file produk terlebih dahulu, lalu tekan <strong>Ambil data login</strong> di kartu ini. Di iPhone, lanjutkan dengan Simpan / Bagikan lalu Simpan ke File. Kamu juga bisa melihat isi file langsung di halaman ini.</p></details>
  </section>;
}
