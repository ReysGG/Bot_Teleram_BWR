"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { productCanEnterCart } from "@/lib/catalog-types";
import type { StorefrontProduct } from "@/lib/catalog-types";
import type { CartAction, CartCommand, CartItem, CartSnapshot } from "@/lib/cart-api-types";
import { readCartIntent, saveCartIntent, clearCartIntent } from "@/lib/pending-cart-intent";
import { loadAccountCart } from "@/lib/load-account-cart";
export type { CartItem } from "@/lib/cart-api-types";

type CartContextValue = {
  items: CartItem[]; itemCount: number; subtotal: number; hydrated: boolean;
  pending: boolean; error: string | null; errorCode: string | null; retryRequired: boolean;
  refresh: () => Promise<void>; retry: () => Promise<boolean>;
  add: (product: StorefrontProduct, quantity?: number) => Promise<boolean>;
  resumeAdd: (product: StorefrontProduct, intentId: string) => Promise<boolean>;
  setQuantity: (productId: string, quantity: number) => Promise<boolean>;
  remove: (productId: string) => Promise<boolean>;
  clear: () => Promise<boolean>;
};
const messages: Record<string, string> = {
  account_unavailable: "Keranjang akunmu belum tersedia. Silakan coba lagi nanti.",
  account_setup_required: "Akun belanja belum selesai disiapkan. Buka halaman Akun untuk mencoba kembali.",
  account_link_required: "Email ini memiliki akun belanja lama. Verifikasi akun lama melalui halaman Akun.",
  email_verification_required: "Verifikasi email utama di akunmu terlebih dahulu.",
  invalid_credentials: "Verifikasi akun belanja lama diperlukan melalui halaman Akun.",
  sign_in_required: "Sesi login berakhir. Silakan masuk kembali.",
  cart_conflict: "Keranjang berubah di perangkat lain. Perbarui keranjang dan periksa isinya sebelum mencoba lagi.",
  cart_key_conflict: "Request keranjang tidak sesuai. Muat ulang halaman sebelum melanjutkan.",
  cart_product_unavailable: "Produk ini sudah tidak tersedia. Pilih produk lainnya.",
  cart_full: "Keranjang maksimal berisi 50 produk berbeda.",
  cart_quantity_invalid: "Jumlah melebihi batas yang dapat disimpan di keranjang.",
  rate_limited: "Perubahan terlalu cepat. Tunggu sebentar, lalu coba lagi.",
};
const CartContext = createContext<CartContextValue | null>(null);
export function CartProvider({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const clerk = useClerk();
  const pathname = usePathname();
  const ownerId = isLoaded && isSignedIn ? userId ?? null : null;
  const authorization = useCallback(async (fresh = false) => {
    const token = await getToken(fresh ? { skipCache: true } : undefined);
    return token ? `Bearer ${token}` : null;
  }, [getToken]);
  const clearExpiredSession = useCallback(async () => {
    // An API verifier/configuration error is not proof the Clerk session ended.
    // Only clean up when Clerk itself can no longer issue a session token.
    const currentToken = await getToken({ skipCache: true });
    if (currentToken) return;
    await fetch("/api/customer/logout", { method: "POST" }).catch(() => null);
    await clerk.signOut({
      redirectUrl: `/sign-in?redirect_url=${encodeURIComponent(pathname || "/")}`,
    });
  }, [clerk, pathname, getToken]);
  return <CartStateProvider key={ownerId ?? "signed-out"} ownerId={ownerId} authReady={isLoaded} authorization={authorization} onSessionExpired={clearExpiredSession}>{children}</CartStateProvider>;
}

function CartStateProvider({ children, ownerId, authReady, authorization, onSessionExpired }: { children: ReactNode; ownerId: string | null; authReady: boolean; authorization: (fresh?: boolean) => Promise<string | null>; onSessionExpired: () => Promise<void> }) {
  const [snapshot, setSnapshot] = useState<CartSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [retryRequired, setRetryRequired] = useState(false);
  const busy = useRef(false);
  const fetching = useRef(false);
  const alive = useRef(true);
  const setupAttempted = useRef(false);
  const setupError = useRef<string | null>(null);
  const sessionCleanupStarted = useRef(false);
  const retryCommand = useRef<CartCommand | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  const accept = useCallback((cart: CartSnapshot) => {
    if (alive.current) setSnapshot(current => !current || cart.revision >= current.revision ? cart : current);
  }, []);
  const refresh = useCallback(async () => {
    if (!ownerId || busy.current || fetching.current) return;
    fetching.current = true;
    try {
      const result = await loadAccountCart({
        allowSetup: !setupAttempted.current,
        isCurrent: () => alive.current,
        onSetupStarted: () => { setupAttempted.current = true; },
        onPrepared: () => { if (alive.current) router.refresh(); },
        authorization,
      });
      if (!alive.current) return;
      if (!result.ok) {
        if (result.code !== "account_setup_required") setupError.current = result.code;
        setErrorCode(result.code === "account_setup_required" ? setupError.current ?? result.code : result.code);
        if (result.code === "sign_in_required" && !sessionCleanupStarted.current) {
          sessionCleanupStarted.current = true;
          void onSessionExpired().catch(() => {
            if (alive.current) sessionCleanupStarted.current = false;
          });
        }
        return;
      }
      setupError.current = null;
      accept(result.cart);
      if (alive.current && !retryCommand.current) setErrorCode(null);
    } catch { if (alive.current) setErrorCode("cart_unavailable"); }
    finally { fetching.current = false; }
  }, [ownerId, accept, router, authorization, onSessionExpired]);

  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => void refresh(), 0);
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    if (ownerId && typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel(`storefront-cart:${ownerId}`);
      channel.current.onmessage = () => void refresh();
    }
    return () => {
      alive.current = false; window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus);
      channel.current?.close(); channel.current = null;
    };
  }, [ownerId, refresh]);
  useEffect(() => { if (pathname === "/cart") { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); } }, [pathname, refresh]);

  const send = useCallback(async (command: CartCommand): Promise<boolean> => {
    if (!ownerId || busy.current) return false;
    busy.current = true; setPending(true); setErrorCode(null);
    retryCommand.current = command;
    try {
      const request = async (fresh = false) => {
        const authHeader = await authorization(fresh);
        const headers = new Headers({ "content-type": "application/json" });
        if (authHeader) headers.set("authorization", authHeader);
        const response = await fetch("/api/cart", { method: "POST", headers, body: JSON.stringify(command), signal: AbortSignal.timeout(12000) });
        const result = await response.json();
        return { response, result };
      };
      let { response, result } = await request();
      if (response.status === 401 && result.code === "sign_in_required") ({ response, result } = await request(true));
      if (!alive.current) return false;
      if (!response.ok || !result.ok) {
        if (response.status < 500) { retryCommand.current = null; clearCartIntent(command.idempotencyKey); }
        setRetryRequired(Boolean(retryCommand.current));
        setErrorCode(result.code ?? "cart_unavailable");
        if (result.code === "cart_conflict") {
          const authHeader = await authorization();
          const headers = new Headers();
          if (authHeader) headers.set("authorization", authHeader);
          const latest = await fetch("/api/cart", { cache: "no-store", headers, signal: AbortSignal.timeout(12000) });
          const data = await latest.json(); if (latest.ok && data.ok) accept(data.cart);
        }
        return false;
      }
      clearCartIntent(command.idempotencyKey);
      accept(result.cart); retryCommand.current = null; setRetryRequired(false);
      channel.current?.postMessage("changed");
      return true;
    } catch {
      if (alive.current) { setRetryRequired(Boolean(retryCommand.current)); setErrorCode("cart_unavailable"); }
      return false;
    } finally { busy.current = false; if (alive.current) setPending(false); }
  }, [ownerId, accept, authorization]);
  const mutate = useCallback(async (action: CartAction) => {
    if (!ownerId || !snapshot || busy.current || retryCommand.current) return false;
    return send({ ...action, expectedRevision: snapshot.revision, idempotencyKey: crypto.randomUUID() });
  }, [ownerId, snapshot, send]);
  const resumeAdd = useCallback(async (product: StorefrontProduct, intentId: string) => {
    if (!ownerId || !snapshot || busy.current) return false;
    if (!productCanEnterCart(product)) { clearCartIntent(intentId); return false; }
    const intent = readCartIntent(intentId, product.id);
    if (!intent || (intent.ownerId && intent.ownerId !== ownerId) ||
      (retryCommand.current && retryCommand.current.idempotencyKey !== intentId)) return false;
    const command: CartCommand = intent.command ?? { action: "add", productId: product.id, quantity: intent.quantity, expectedRevision: snapshot.revision, idempotencyKey: intent.id };
    if (!saveCartIntent({ ...intent, ownerId, command })) return false;
    return send(command);
  }, [ownerId, snapshot, send]);
  const retry = useCallback(async () => retryCommand.current ? send(retryCommand.current) : false, [send]);
  const items = useMemo(() => snapshot?.items ?? [], [snapshot]);
  const value = useMemo<CartContextValue>(() => ({
    items, itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: items.filter(item => item.canCheckout).reduce((sum, item) => sum + item.price * item.quantity, 0),
    hydrated: authReady && (!ownerId || Boolean(snapshot)), pending, errorCode, retryRequired,
    error: errorCode ? messages[errorCode] ?? "Keranjang belum dapat diperbarui. Coba lagi." : null,
    refresh, retry, resumeAdd,
    add: (product, quantity = 1) => mutate({ action: "add", productId: product.id, quantity }),
    setQuantity: (productId, quantity) => mutate({ action: "set", productId, quantity }),
    remove: productId => mutate({ action: "remove", productId }), clear: () => mutate({ action: "clear" }),
  }), [items, ownerId, authReady, snapshot, pending, errorCode, retryRequired, refresh, retry, resumeAdd, mutate]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside CartProvider");
  return value;
}
