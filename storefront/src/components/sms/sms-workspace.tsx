"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { formatRupiah } from "@/lib/catalog-types";
import type { SmsCatalog, SmsOrder } from "@/lib/sms-types";
import { useSmsRequest } from "./use-sms-request";
import { SmsPanel } from "./sms-ui";
import { SmsCountryPicker, SmsServicePicker } from "./sms-pickers";
import { SmsPurchaseSummary } from "./sms-purchase-summary";
import styles from "./sms.module.css";

export function SmsWorkspace() {
  const { userId } = useAuth();
  return <SmsWorkspaceSession key={userId || "anonymous"} />;
}
function SmsWorkspaceSession() {
  const { isLoaded, isSignedIn } = useAuth(); const request = useSmsRequest(); const router = useRouter();
  const [catalog, setCatalog] = useState<SmsCatalog | null>(null);
  const [serviceId, setServiceId] = useState(0), [countryId, setCountryId] = useState(0);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(""); const [reload, setReload] = useState(0); const key = useRef("");
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const controller = new AbortController();
    request<SmsCatalog>(`/api/sms${serviceId ? `?serviceId=${serviceId}` : ""}`, { signal: controller.signal }).then(setCatalog).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, serviceId, reload, request]);
  const service = catalog?.services.find(s => s.id === serviceId);
  const country = catalog?.countries.find(c => c.id === countryId);
  function chooseService(id: number) { if (id === serviceId) return; setLoading(true); setError(""); setServiceId(id); setCountryId(0); key.current = ""; }
  async function buy() {
    if (!country || !service || busy || !catalog || loading) return;
    setBusy(true); setError(""); key.current ||= crypto.randomUUID();
    try {
      const result = await request<{ order: SmsOrder }>("/api/sms", { method: "POST", body: JSON.stringify({ serviceId, countryId, expectedPrice: country.price, idempotencyKey: key.current }) });
      router.push(`/sms/orders/${encodeURIComponent(result.order.id)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Pembelian belum berhasil. Periksa riwayat sebelum mencoba kembali."); setConfirming(false); setLoading(true); setReload(n => n + 1); }
    finally { setBusy(false); }
  }
  return <main className={`page-width ${styles.page}`}>
    <section className={styles.hero}><div><h1>Beli nomor.<br /><em>Terima SMS OTP.</em></h1><p>Pilih layanan dan negara, ambil nomor, lalu pantau kode OTP dari satu halaman.</p><Link href="/sms/orders" className="button button-quiet">Pesanan saya <Icon name="arrow-right" size={17} /></Link></div><Image src="/sms/hero.webp" alt="Karakter BWR Tele menerima pesan melalui ponsel" width={600} height={400} sizes="(max-width:860px) 320px, 500px" priority /></section>
    {!isLoaded ? <p role="status">Menyiapkan akun…</p> : !isSignedIn ? <SmsPanel><h2>Masuk untuk mulai</h2><p>Nomor, kode OTP, dan saldo hanya dapat diakses dari akunmu.</p><Link className="button button-primary" href="/sign-in?redirect_url=%2Fsms">Masuk ke akun</Link></SmsPanel> : <>
      {error ? <div className={styles.error} role="alert">{error} <Link href="/account">Buka akun</Link> · <Link href="/sms/orders">Periksa pesanan SMS</Link></div> : null}
      <div className={styles.layout}><div className={styles.steps}>
        <SmsPanel><div className={styles.stepTitle}><span>1</span><div><h2>Pilih layanan</h2><p>Cari aplikasi yang ingin kamu gunakan.</p></div></div>
          <SmsServicePicker services={catalog?.services ?? []} value={serviceId} onChange={chooseService} disabled={busy} />
          {loading && !catalog ? <p role="status">Memuat layanan…</p> : null}
        </SmsPanel>
        <SmsPanel><div className={styles.stepTitle}><span>2</span><div><h2>Pilih negara</h2><p>Harga akhir ditampilkan sebelum pembelian.</p></div></div>
          {!serviceId ? <p className={styles.muted}>Pilih layanan terlebih dahulu.</p> : <SmsCountryPicker key={serviceId} countries={catalog?.countries ?? []} value={countryId} loading={loading} disabled={busy} onChange={id => { if (id !== countryId) { setCountryId(id); key.current = ""; } }} />}
        </SmsPanel>
      </div><SmsPurchaseSummary catalog={catalog} serviceId={serviceId} countryId={countryId} loading={loading} busy={busy} onBuy={() => setConfirming(true)} /></div>
      <ConfirmationModal open={confirming && Boolean(country)} title="Konfirmasi pembelian nomor" pending={busy} confirmLabel="Ya, beli nomor" cancelLabel="Kembali" onCancel={() => setConfirming(false)} onConfirm={buy}>
        <p>{service?.name} · {country?.name}</p><strong className={styles.confirmPrice}>{formatRupiah(country?.price ?? 0)}</strong><p>Nominal ini akan dipotong dari saldo website. Nomor dan kode muncul di halaman pesanan SMS.</p>
      </ConfirmationModal>
    </>}
  </main>;
}
