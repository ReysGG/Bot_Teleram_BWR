"use client";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";
import { useCart } from "./cart-context";
import { readCartIntent } from "@/lib/pending-cart-intent";
import type { StorefrontProduct } from "@/lib/catalog-types";

export function ResumeCartAddition({ product }: { product: StorefrontProduct }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { hydrated, pending, resumeAdd, retry, retryRequired, error } = useCart();
  const started = useRef(false);
  const [state, setState] = useState<"idle" | "loading" | "done" | "failed">("idle");
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !hydrated || pending || started.current) return;
    const id = new URLSearchParams(window.location.search).get("cart_intent");
    const intent = id ? readCartIntent(id, product.id) : null;
    if (!intent || (intent.ownerId && intent.ownerId !== userId)) return;
    const timer = window.setTimeout(() => {
      started.current = true;
      setState("loading");
      void resumeAdd(product, intent.id).then(ok => setState(ok ? "done" : "failed"));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isLoaded, isSignedIn, userId, hydrated, pending, resumeAdd, product]);
  if (state === "idle") return null;
  return <div className="cart-resume-notice" role="status" aria-live="polite">
    {state === "loading" ? "Menyiapkan keranjang untuk produk pilihanmu…" : state === "done" ? <>Produk pilihanmu sudah ditambahkan. <Link href="/cart">Lihat keranjang</Link></> : <>
      {error ?? "Produk belum dapat ditambahkan. Silakan periksa keranjang."}
      {retryRequired ? <button type="button" disabled={pending} onClick={async () => { setState("loading"); setState(await retry() ? "done" : "failed"); }}>Coba lagi</button> : <Link href="/cart">Buka keranjang</Link>}
    </>}
  </div>;
}
