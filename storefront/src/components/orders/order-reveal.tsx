"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { StorefrontOrderSummary } from "@/lib/store-api-contract";

export type RevealOrder = Pick<StorefrontOrderSummary, "id" | "productName" | "status" | "paymentStatus" | "deliveryState" | "quantity" | "readyFiles" | "deliveredFiles">;
export function revealMode(order: RevealOrder) {
  if (order.paymentStatus !== "PAID") return "none";
  if (order.status === "PAID_WAITING_STOCK") return "preorder";
  if (!["FULFILLING", "COMPLETED"].includes(order.status) || ["EXPIRED", "CANCELLED", "REFUNDED", "DELIVERED"].includes(order.deliveryState)) return "none";
  return order.deliveryState === "READY" && order.quantity > 0 && order.readyFiles + order.deliveredFiles >= order.quantity ? "ready" : "processing";
}

const ART = "/animations/order-opening.png";
const STORAGE = "bwr:opened-orders:v1";
const seenInMemory = new Set<string>();
function alreadySeen(id: string) {
  if (seenInMemory.has(id)) return true;
  try { return localStorage.getItem(`${STORAGE}:${id}`) === "1"; } catch { return false; }
}
function remember(id: string) {
  seenInMemory.add(id);
  try { localStorage.setItem(`${STORAGE}:${id}`, "1"); } catch { /* Presentation-only fallback; never authorizes order access. */ }
}

// Clip only the intended frame. Unequal frame widths keep the final glow intact.
const edges = [0, 365, 721, 1057, 1404, 1752, 2172];
const centers = [198, 185, 170, 172, 174, 190];
export function PackageFrame({ frame }: { frame: number }) {
  const clipId = useId();
  const index = Math.max(0, Math.min(5, frame));
  const offset = 230 - centers[index];
  return <svg className="order-package-frame" viewBox="0 0 460 610" aria-hidden="true" focusable="false" data-frame={index}>
    <defs><clipPath id={clipId}><rect x={offset} y="0" width={edges[index + 1] - edges[index]} height="610" /></clipPath></defs>
    <image href={ART} width="2172" height="724" x={offset - edges[index]} y="0" clipPath={`url(#${clipId})`} />
  </svg>;
}

export function OrderReveal({ order }: { order: RevealOrder }) {
  const mode = revealMode(order);
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [frame, setFrame] = useState(0);
  const [checking, startTransition] = useTransition();
  const [checks, setChecks] = useState(0);
  const titleId = useId();
  const finish = useCallback((showProducts = false) => {
    timers.current.forEach(clearTimeout); timers.current = [];
    const wasOpen = dialog.current?.open;
    if (wasOpen) dialog.current?.close();
    if (showProducts && wasOpen) {
      const products = document.getElementById("order-products");
      products?.focus({ preventScroll: true });
      products?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, []);

  useEffect(() => {
    if (mode !== "ready" || order.deliveredFiles > 0 || alreadySeen(order.id)) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { remember(order.id); return; }
    let cancelled = false;
    const artwork = new window.Image();
    artwork.onload = () => {
      if (cancelled || alreadySeen(order.id)) return;
      try { dialog.current?.showModal(); } catch { return; }
      if (!dialog.current?.open) return;
      remember(order.id);
      setFrame(0);
      for (let index = 1; index <= 5; index++) timers.current.push(setTimeout(() => setFrame(index), index * 280));
      timers.current.push(setTimeout(() => finish(true), 2000));
    };
    artwork.onerror = () => finish();
    artwork.src = ART;
    return () => { cancelled = true; artwork.onload = null; artwork.onerror = null; finish(); };
  }, [mode, order.id, order.deliveredFiles, finish]);

  // Refresh the authenticated server page, never invoke payment confirmation.
  // Transition state prevents overlapping refreshes; stop after ten attempts.
  useEffect(() => {
    if (mode !== "processing" || checking || checks >= 10) return;
    const timer = setTimeout(() => {
      setChecks(count => count + 1);
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, 4000);
    return () => clearTimeout(timer);
  }, [mode, checks, checking, router]);

  if (mode === "none") return null;
  if (mode !== "ready") return <section className="order-preparing" role="status">
    <PackageFrame frame={mode === "preorder" ? 0 : 3} />
    <div><h2>{mode === "preorder" ? "Pembayaran diterima, menunggu stok" : "Menyiapkan produkmu…"}</h2><p>{mode === "preorder" ? "Produk preorder akan tersedia setelah stok dialokasikan untuk pesananmu." : "Pembayaran sudah terverifikasi. File akan tersedia setelah proses penyiapan selesai."}</p>
      <button type="button" className="button button-quiet" disabled={checking} onClick={() => { setChecks(0); startTransition(() => router.refresh()); }}>{checking ? "Memperbarui…" : "Perbarui status"}</button>
    </div>
  </section>;
  return <>
    <section className="order-ready-notice"><Icon name="circle-check" size={25} aria-hidden="true" /><div><strong>Produkmu siap!</strong><p>Ambil file produk, lalu ikuti panduan claim di bawah.</p></div><a href="#order-products">Lihat produk <Icon name="arrow-right" size={16} aria-hidden="true" /></a></section>
    <dialog className="order-reveal-dialog" ref={dialog} aria-labelledby={titleId} onCancel={() => finish(true)}>
      <button type="button" className="order-reveal-skip" autoFocus onClick={() => finish(true)}>Lewati <Icon name="x" size={16} aria-hidden="true" /></button>
      <span className="order-reveal-confirmed"><Icon name="shield-check" size={17} aria-hidden="true" /> Pembayaran terverifikasi</span>
      <PackageFrame frame={frame} />
      <h2 id={titleId}>{frame === 5 ? "Produkmu siap!" : "Membuka paketmu…"}</h2>
      <p>{order.productName}</p>
    </dialog>
  </>;
}
