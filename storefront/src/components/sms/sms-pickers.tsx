"use client";
import { useMemo, useState } from "react";
import type { SmsCatalog } from "@/lib/sms-types";
import { formatRupiah } from "@/lib/catalog-types";
import { SmsServiceLogo } from "./sms-service-logo";
import styles from "./sms.module.css";

export function SmsServicePicker({ services, value, disabled, onChange }: { services: SmsCatalog["services"]; value: number; disabled?: boolean; onChange: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => services.filter(s => s.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [services, query]);
  const selected = services.find(s => s.id === value);
  const pageSize = 24;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return <>
    <input className={styles.input} aria-label="Cari layanan SMS" placeholder="Cari semua layanan SMSPool…" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }} disabled={disabled} />
    <p className={styles.muted}>{filtered.length.toLocaleString("id-ID")} layanan{selected ? ` · Dipilih: ${selected.name}` : ""}</p>
    <div className={styles.serviceChoices} role="group" aria-label="Layanan SMSPool">{visible.map(s => <button key={s.id} className={value === s.id ? styles.selected : ""} aria-label={`Pilih layanan ${s.name}`} aria-pressed={value === s.id} disabled={disabled} onClick={() => onChange(s.id)}><SmsServiceLogo name={s.name} /><span className={styles.serviceName}>{s.name}</span>{value === s.id ? <small>✓ Dipilih</small> : null}</button>)}</div>
    {!filtered.length ? <p>Tidak ada layanan yang cocok. Coba kata pencarian lain.</p> : null}
    {pageCount > 1 ? <nav className={styles.servicePagination} aria-label="Halaman layanan SMS"><button type="button" disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Sebelumnya</button><span>{currentPage + 1} / {pageCount}</span><button type="button" disabled={disabled || currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Berikutnya</button></nav> : null}
  </>;
}
export function SmsCountryPicker({ countries, value, loading, disabled, onChange }: { countries: SmsCatalog["countries"]; value: number; loading: boolean; disabled?: boolean; onChange: (id: number) => void }) {
  const [query, setQuery] = useState("");
  const filtered = countries.filter(c => c.name.toLowerCase().includes(query.toLowerCase()));
  return <><input className={styles.input} aria-label="Cari negara SMS" placeholder="Cari negara…" value={query} onChange={e => setQuery(e.target.value)} disabled={disabled} />
    {loading ? <p role="status">Mencari pilihan nomor…</p> : <div className={styles.countryList} role="group" aria-label="Pilihan negara SMS">{filtered.map(c => <button key={c.id} className={`${styles.country} ${value === c.id ? styles.selected : ""}`} disabled={disabled} aria-pressed={value === c.id} onClick={() => onChange(c.id)}><span className={styles.countryCode}>{c.code}</span><span>{c.name}</span><strong>{formatRupiah(c.price)}</strong>{value === c.id ? <span aria-label="Dipilih">✓</span> : null}</button>)}{!filtered.length ? <p>Belum ada pilihan negara. Coba layanan lain.</p> : null}</div>}
  </>;
}
