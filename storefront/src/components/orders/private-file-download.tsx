"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./private-file-download.module.css";

export function isAppleTouchDevice(ua: string, platform: string, touches: number) {
  return /iPad|iPhone|iPod/i.test(ua) || (platform === "MacIntel" && touches > 1);
}
export function privateDownloadName(disposition: string, fallback: string) {
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = disposition.match(/filename="([^"]+)"/i)?.[1] || fallback;
  if (encoded) { try { name = decodeURIComponent(encoded); } catch { /* Keep fallback. */ } }
  return name.replace(/[\r\n\0/\\]/g, "_").slice(0, 180) || "produk.txt";
}
type Prepared = { file: File; url: string; text: string | null; shareable: boolean; apple: boolean };
export function PrivateFileDownload({ endpoint, filename, label, method = "GET", disabled = false, onHandedOff }: {
  endpoint: string; filename: string; label: string; method?: "GET" | "POST"; disabled?: boolean; onHandedOff?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [ready, setReady] = useState<Prepared | null>(null);
  const [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const currentUrl = useRef<string | null>(null);
  useEffect(() => () => {
    request.current?.abort(); request.current = null;
    if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    currentUrl.current = null;
  }, [endpoint]);
  async function prepare() {
    if (request.current || sharing) return;
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setNotice("");
    try {
      const response = await fetch(endpoint, { method, cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(response.status === 401 ? "Silakan masuk kembali untuk mengambil file." : response.status === 413 ? "File gabungan terlalu besar. Gunakan download per file." : "File belum dapat diambil. Coba kembali atau hubungi bantuan.");
      const blob = await response.blob();
      const name = privateDownloadName(response.headers.get("content-disposition") || "", filename);
      const type = /\.txt$/i.test(name) ? "text/plain" : /\.json$/i.test(name) ? "application/json" : /\.zip$/i.test(name) ? "application/zip" : blob.type || "application/octet-stream";
      const file = new File([blob], name, { type });
      const text = /\.(txt|json)$/i.test(name) && blob.size <= 1024 * 1024 ? await blob.text() : null;
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(file);
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = url;
      let shareable = false;
      try { shareable = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }); } catch { /* Keep download fallback. */ }
      const apple = isAppleTouchDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
      setReady({ file, url, text, shareable, apple });
      setNotice(apple ? shareable ? "File siap. Pilih Simpan / Bagikan atau Unduh file di bawah." : "File siap. Pilih Unduh file atau Lihat isi file di bawah. Jika browser dalam aplikasi bermasalah, buka pesanan ini di Safari." : "File siap. Jika unduhan belum muncul, gunakan pilihan di bawah.");
      if (!apple) {
        const link = document.createElement("a"); link.href = url; link.download = name;
        document.body.appendChild(link); link.click(); link.remove(); onHandedOff?.();
      }
    } catch (error) { if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : "File belum dapat diambil."); }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  async function share() {
    if (!ready || sharing) return;
    setSharing(true); setNotice("");
    // A fresh tap after preparation preserves Safari user activation.
    try {
      await navigator.share({ files: [ready.file], title: ready.file.name });
      setNotice("Pilihan berbagi selesai. Periksa lokasi yang kamu pilih; file tetap bisa diambil kembali.");
      onHandedOff?.();
    } catch (error) {
      setNotice(error instanceof Error && error.name === "AbortError" ? "Penyimpanan dibatalkan. File masih siap di halaman ini." : "Menu berbagi belum tersedia. Gunakan Unduh file atau Lihat isi file. Jika memakai browser Telegram, buka halaman pesanan ini di Safari.");
    } finally { setSharing(false); }
  }
  return <div className={styles.root} data-file-ready={Boolean(ready)}>
    <button className="button button-primary" disabled={disabled || busy || sharing} onClick={prepare}>{busy ? "Menyiapkan file…" : ready ? "Siapkan ulang" : label}</button>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {ready ? <div className={styles.prepared}>
      <strong>{ready.file.name}</strong><div className={styles.actions}>
        {ready.shareable ? <button className="button button-primary" disabled={sharing || busy} onClick={share}>{sharing ? "Membuka pilihan…" : "Simpan / Bagikan"}</button> : null}
        <a className="button button-quiet" href={ready.url} download={ready.file.name} onClick={() => onHandedOff?.()}>Unduh file</a>
        {method === "GET" ? <a className="button button-quiet" href={endpoint} target="_blank" rel="noopener noreferrer">Unduh melalui browser</a> : null}
      </div>
      <p className={styles.notice}>{ready.apple ? "Di iPhone: pilih Simpan ke File (Save to Files), lalu iCloud Drive atau Di iPhone Saya. TXT/JSON/ZIP tidak masuk ke galeri Foto." : "Unduhan dapat ditemukan di folder Downloads perangkatmu."}</p>
      {ready.text !== null ? <details className={styles.preview}><summary>Lihat isi file</summary><p>Isi pribadi pesananmu. Kamu bisa menyeleksi dan menyalin teks atau link di bawah.</p><textarea aria-label="Isi file produk" readOnly value={ready.text} spellCheck={false} /></details> : null}
    </div> : null}
  </div>;
}
