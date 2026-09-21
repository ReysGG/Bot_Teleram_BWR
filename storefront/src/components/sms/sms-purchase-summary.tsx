"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { formatRupiah } from "@/lib/catalog-types";
import type { SmsCatalog } from "@/lib/sms-types";
import { SmsPanel } from "./sms-ui";
import { SmsServiceLogo } from "./sms-service-logo";
import styles from "./sms.module.css";
export function SmsPurchaseSummary({ catalog, serviceId, countryId, loading, busy, onBuy }: { catalog: SmsCatalog | null; serviceId: number; countryId: number; loading: boolean; busy: boolean; onBuy: () => void }) {
  const service = catalog?.services.find(s => s.id === serviceId), country = catalog?.countries.find(c => c.id === countryId);
  const balance = catalog?.balance ?? 0;
  const insufficient = Boolean(country && balance < country.price);
  return <SmsPanel as="aside" className={styles.summary}><span className={styles.eyebrow}>RINGKASAN PESANAN</span><h2>Siap ambil nomor?</h2><dl><div><dt>Layanan</dt><dd className={styles.serviceHeading}>{service ? <SmsServiceLogo name={service.name} size={24} /> : null}{service?.name || "Belum dipilih"}</dd></div><div><dt>Negara</dt><dd>{country?.name || "Belum dipilih"}</dd></div></dl>
    <div className={styles.total}><span>Total pembayaran</span><strong>{country ? formatRupiah(country.price) : "—"}</strong></div>
    <div className={styles.balance}><Icon name="wallet" size={22} /><div><span>Saldo website</span><strong>{formatRupiah(balance)}</strong></div></div>
    {country && !insufficient ? <p className={styles.muted}>Perkiraan sisa saldo: <strong>{formatRupiah(balance - country.price)}</strong></p> : null}
    <button className="button button-primary" disabled={!country || loading || busy || !catalog?.walletEnabled || catalog.maintenance || insufficient} onClick={onBuy}>Beli nomor <Icon name="arrow-right" size={17} /></button>
    {insufficient ? <p className={styles.error}>Saldo website belum cukup.</p> : null}
    {catalog?.maintenance ? <p className={styles.error}>Checkout sedang maintenance.</p> : catalog && !catalog.walletEnabled ? <p className={styles.error}>Pembayaran saldo sedang dinonaktifkan.</p> : null}
    <p className={styles.muted}>Ketersediaan nomor diperiksa saat pembelian. Pembayaran memakai saldo akun website. Saldo Telegram terpisah. Top up website belum tersedia.</p><Link href="/account/wallet">Lihat saldo dan riwayat</Link>
  </SmsPanel>;
}
