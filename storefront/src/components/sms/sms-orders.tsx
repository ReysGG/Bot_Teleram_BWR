"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Icon } from "@/components/ui/icon";
import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import { SmsCopyButton, SmsEmptyState, SmsPanel, SmsStatusBadge, SmsWaitingIllustration, smsStatusLabel } from "./sms-ui";
import { formatRupiah } from "@/lib/catalog-types";
import type { SmsOrder } from "@/lib/sms-types";
import { useSmsRequest } from "./use-sms-request";
import { SmsServiceLogo } from "./sms-service-logo";
import styles from "./sms.module.css";
export function SmsOrders({ orderId }: { orderId?: string }) {
  const { userId } = useAuth();
  return <SmsOrdersSession key={`${userId || "anonymous"}:${orderId || "list"}`} orderId={orderId} />;
}
function SmsOrdersSession({ orderId }: { orderId?: string }) {
  const { isLoaded, isSignedIn } = useAuth(); const request = useSmsRequest();
  const [orders, setOrders] = useState<SmsOrder[]>([]), [order, setOrder] = useState<SmsOrder | null>(null);
  const [cursor, setCursor] = useState<string | null>(null), [pageCursor, setPageCursor] = useState("");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [cancelPrompt, setCancelPrompt] = useState(false), [now, setNow] = useState(Date.now());
  const load = useCallback(async (signal?: AbortSignal) => {
    if (orderId) { const result = await request<{ order: SmsOrder }>(`/api/sms/orders/${encodeURIComponent(orderId)}`, { signal }); setOrder(result.order); }
    else { const result = await request<{ orders: SmsOrder[]; nextCursor: string | null }>(`/api/sms?view=orders${pageCursor ? `&cursor=${encodeURIComponent(pageCursor)}` : ""}`, { signal }); setOrders(result.orders); setCursor(result.nextCursor); }
  }, [orderId, pageCursor, request]);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const controller = new AbortController();
    load(controller.signal).catch(e => { if (!controller.signal.aborted) setNotice(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [isLoaded, isSignedIn, load]);
  const waiting = Boolean(order && (["ACTIVE", "PROCESSING"].includes(order.status) || (order.status === "COMPLETED" && !order.otpCode && !order.fullCode)));
  useEffect(() => {
    if (!waiting) return;
    let inFlight = false; const controller = new AbortController();
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible" || inFlight) return;
      inFlight = true; try { await load(controller.signal); } catch { /* Manual refresh remains available. */ } finally { inFlight = false; }
    }, 10_000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(timer); clearInterval(clock); controller.abort(); };
  }, [waiting, load]);
  async function action(action: "refresh" | "cancel") {
    if (!order || busy) return; setBusy(true); setNotice("");
    try {
      const result = await request<{ order: SmsOrder }>(`/api/sms/orders/${encodeURIComponent(order.id)}`, { method: "POST", body: JSON.stringify({ action }) });
      setOrder(result.order); setCancelPrompt(false); setNotice(action === "cancel" ? "Status pembatalan diperbarui. Refund masuk ke saldo website jika pembatalan berhasil." : "Status terbaru sudah diperiksa.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Permintaan belum berhasil."); } finally { setBusy(false); }
  }
  const remaining = order?.expiresAt ? Math.max(0, Math.ceil((new Date(order.expiresAt).getTime() - now) / 1000)) : null;
  return <main className={`page-width ${styles.page}`}><div className={styles.pageHeading}><div><h1>{orderId ? "Nomor & kode OTP" : "Pesanan SMS kamu"}</h1><p>{orderId ? "Salin nomor ke layanan yang kamu pilih, lalu tunggu kode SMS di sini." : "Pantau nomor aktif, lihat kode, dan periksa riwayat pembelian."}</p></div><Link href={orderId ? "/sms/orders" : "/sms"} className="button button-quiet">{orderId ? "Semua pesanan" : "Beli nomor"}</Link></div>
    {!isLoaded ? <p role="status">Menyiapkan akun…</p> : !isSignedIn ? <SmsPanel><h2>Masuk untuk melihat pesanan SMS</h2><Link className="button button-primary" href={`/sign-in?redirect_url=${encodeURIComponent(orderId ? `/sms/orders/${orderId}` : "/sms/orders")}`}>Masuk ke akun</Link></SmsPanel> : <>
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {loading ? <SmsPanel role="status">Memuat pesanan SMS…</SmsPanel> : orderId ? order ? <div className={styles.orderLayout}>
        <SmsPanel><SmsStatusBadge status={order.status} waiting={waiting} /><div className={styles.serviceHeading}><SmsServiceLogo name={order.serviceName} /><h2>{order.serviceName}</h2></div><p>{order.countryName}</p><div className={styles.phone}><span>Nomor telepon</span><strong>{order.phoneNumber || "Sedang menyiapkan…"}</strong>{order.phoneNumber ? <SmsCopyButton value={order.phoneNumber} label="Salin nomor" onNotice={setNotice} /> : null}</div>
          <div className={styles.otp}><span>Kode OTP</span>{waiting ? <SmsWaitingIllustration /> : null}<strong>{order.otpCode || (waiting ? "· · · · · ·" : "Belum ada kode")}</strong>{order.otpCode ? <SmsCopyButton value={order.otpCode} label="Salin kode OTP" primary onNotice={setNotice} /> : <p>{waiting ? "Kode akan tampil otomatis setelah SMS diterima." : "Periksa status pesanan atau hubungi admin jika ada kendala."}</p>}{order.fullCode ? <pre>{order.fullCode}</pre> : null}</div>
          {waiting ? <p className={styles.muted}>{remaining !== null ? `Sisa waktu ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}` : "Menunggu nomor dari provider"} · Status diperbarui setiap 10 detik saat halaman terbuka.</p> : null}
          <div className={styles.actions}><button className="button button-quiet" disabled={busy} onClick={() => action("refresh")}>{busy ? "Memeriksa…" : "Refresh status"}</button>{order.status === "ACTIVE" ? <button className="button button-quiet" disabled={busy} onClick={() => setCancelPrompt(true)}>Batalkan nomor</button> : null}</div>
        </SmsPanel><SmsPanel as="aside"><h2>Ringkasan pembelian</h2><dl><div><dt>Total</dt><dd>{formatRupiah(order.price)}</dd></div><div><dt>Pembayaran</dt><dd>Saldo website</dd></div><div><dt>Dibuat</dt><dd>{new Date(order.createdAt).toLocaleString("id-ID")}</dd></div></dl><p>Nomor dan kode ini hanya tersedia untuk akunmu. Refund yang berhasil diproses masuk ke saldo website.</p><Link href="/account/wallet">Lihat riwayat saldo</Link><p><a href="https://t.me/davidboysaja" target="_blank" rel="noopener noreferrer">Hubungi admin</a></p></SmsPanel>
      </div> : <SmsPanel><p>Pesanan tidak tersedia.</p><Link href="/sms/orders">Kembali ke pesanan SMS</Link></SmsPanel> : <SmsPanel>
        {orders.length ? <div className={styles.orderList}>{orders.map(item => <Link href={`/sms/orders/${encodeURIComponent(item.id)}`} key={item.id} className={styles.orderRow}><SmsServiceLogo name={item.serviceName} /><span><strong>{item.serviceName}</strong><small>{item.countryName} · {item.phoneNumber || "Nomor belum tersedia"}</small></span><span><strong>{formatRupiah(item.price)}</strong><small>{smsStatusLabel(item.status)}</small></span><Icon name="arrow-right" size={18} /></Link>)}</div> : <SmsEmptyState title="Belum ada pesanan SMS"><p>Pilih layanan dan negara untuk mengambil nomor pertamamu.</p><Link className="button button-primary" href="/sms">Cari nomor</Link></SmsEmptyState>}
        <div className={styles.actions}>{pageCursor ? <button className="button button-quiet" onClick={() => setPageCursor("")}>Pesanan terbaru</button> : null}{cursor ? <button className="button button-quiet" onClick={() => setPageCursor(cursor)}>Pesanan sebelumnya</button> : null}</div>
      </SmsPanel>}
      <ConfirmationModal open={cancelPrompt} title="Batalkan nomor ini?" pending={busy} confirmLabel="Ya, batalkan" cancelLabel="Tetap gunakan" icon="phone" onCancel={() => setCancelPrompt(false)} onConfirm={() => action("cancel")}><p>Pembatalan diproses sesuai status provider. Saldo dikembalikan setelah pembatalan berhasil.</p></ConfirmationModal>
    </>}
  </main>;
}
