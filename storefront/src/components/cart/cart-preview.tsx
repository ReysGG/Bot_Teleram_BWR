"use client";

import { CartSkeleton } from "./cart-skeleton";
import { useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-context";
import { ProductArtwork } from "@/components/catalog/product-artwork";
import { Icon } from "@/components/ui/icon";
import { formatRupiah } from "@/lib/catalog-types";

export function CartPreview() {
  const { isLoaded, isSignedIn } = useAuth();
  const { items, itemCount, subtotal, hydrated, pending, error, retryRequired, setQuantity, remove } = useCart();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const id = useId();
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = () => { cancelClose(); pinned.current = false; setOpen(false); };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) { pinned.current = false; setOpen(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { pinned.current = false; setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return <div
    className="cart-preview"
    ref={root}
    onPointerEnter={event => { if (event.pointerType === "mouse") { cancelClose(); setOpen(true); } }}
    onPointerLeave={event => {
      if (event.pointerType !== "mouse") return;
      cancelClose();
      closeTimer.current = setTimeout(() => {
        if (!pinned.current && !root.current?.querySelector(".cart-preview-panel")?.contains(document.activeElement)) setOpen(false);
      }, 180);
    }}
    onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(); }}
  >
    <button ref={trigger} className="header-cart" data-cart-animation-target type="button"
      aria-label={hydrated ? `Pratinjau keranjang, ${itemCount} item` : "Keranjang sedang dimuat"} aria-expanded={open} aria-controls={id}
      onClick={event => { cancelClose(); setOpen(value => event.detail === 0 ? !value : true); }}>
      <Icon aria-hidden="true" name="cart" size={20} strokeWidth={2.2} />
      {itemCount > 0 ? <b>{itemCount}</b> : null}
    </button>
    {open ? <section id={id} className="cart-preview-panel" aria-label="Isi keranjang" onPointerDown={() => { pinned.current = true; cancelClose(); }}>
      <div className="cart-preview-heading"><div><strong>Keranjangmu</strong><span>{isLoaded && hydrated ? `${itemCount} item` : "Memuat..."}</span></div>
        <button type="button" aria-label="Tutup pratinjau keranjang" onClick={close}><Icon name="x" size={18} aria-hidden="true" /></button>
      </div>
      {!isLoaded ? <CartSkeleton compact />
        : !isSignedIn ? <div className="cart-preview-message"><strong>Masuk untuk melihat keranjang</strong><p>Produk pilihanmu tersimpan di akun belanjamu.</p><Link className="button button-primary" href="/sign-in?redirect_url=%2Fcart" onClick={close}>Masuk ke akun</Link></div>
        : error ? <div className="cart-preview-message"><p role="status">{error}</p><Link href="/cart" onClick={close}>Periksa keranjang</Link></div>
        : !hydrated ? <CartSkeleton compact />
        : items.length === 0 ? <div className="cart-preview-message"><Icon name="cart" size={30} aria-hidden="true" /><strong>Keranjang masih kosong</strong><p>Temukan produk yang kamu butuhkan.</p><Link href="/shop" onClick={close}>Mulai belanja</Link></div>
        : <>
          <ul className="cart-preview-items">
            {items.map(item => <li key={item.id}><Link href={`/products/${encodeURIComponent(item.slug)}`} onClick={close}>
              <ProductArtwork product={item} size="mini" />
              <span className="cart-preview-product"><strong>{item.name}</strong><span>{item.quantity} × {formatRupiah(item.price)}</span>{!item.canCheckout ? <small>Belum dapat checkout</small> : null}</span>
              <span className="cart-preview-price">{formatRupiah(item.price * item.quantity)}</span>
            </Link>
              <div className="cart-preview-item-actions">
                <div className="cart-preview-quantity" aria-label={`Jumlah ${item.name}`}>
                  <button type="button" aria-label={`Kurangi ${item.name}`} disabled={pending || retryRequired || item.quantity <= 1} onClick={() => void setQuantity(item.id, item.quantity - 1)}><Icon name="minus" size={15} aria-hidden="true" /></button>
                  <span aria-live="polite">{item.quantity}</span>
                  <button type="button" aria-label={`Tambah ${item.name}`} disabled={pending || retryRequired || !item.canCheckout || item.quantity >= item.maxQuantity} onClick={() => void setQuantity(item.id, item.quantity + 1)}><Icon name="plus" size={15} aria-hidden="true" /></button>
                </div>
                <button className="cart-preview-remove" type="button" aria-label={`Hapus ${item.name}`} disabled={pending || retryRequired} onClick={() => void remove(item.id)}><Icon name="trash" size={16} aria-hidden="true" /><span>Hapus</span></button>
              </div>
            </li>)}
          </ul>
          <div className="cart-preview-footer">
            {pending ? <p role="status">Memperbarui keranjang...</p> : null}
            <div><span>Subtotal{items.some(item => !item.canCheckout) ? " produk tersedia" : ""}</span><strong>{formatRupiah(subtotal)}</strong></div>
            <p>Total akhir ditampilkan saat checkout.</p>
            <Link className="button button-primary" href="/cart" onClick={close}>Lihat keranjang <Icon name="arrow-right" size={17} aria-hidden="true" /></Link>
          </div>
        </>}
    </section> : null}
  </div>;
}
