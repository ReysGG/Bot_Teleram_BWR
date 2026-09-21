"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ProductArtwork } from "@/components/catalog/product-artwork";
import { AddToCartButton } from "@/components/catalog/add-to-cart-button";
import { useCart, type CartItem } from "@/components/cart/cart-context";
import { PageHeading } from "@/components/site/page-heading";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Icon } from "@/components/ui/icon";
import { formatRupiah, productCanEnterCart, type StorefrontProduct } from "@/lib/catalog-types";
import { CartSkeleton } from "./cart-skeleton";
import styles from "./cart-workspace.module.css";

function checkoutHref(item: CartItem) {
  return `/checkout/${encodeURIComponent(item.slug)}?qty=${item.quantity}`;
}

function CartProductRow({ item, selected, onSelect }: {
  item: CartItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { setQuantity, remove, pending, retryRequired } = useCart();
  const [working, setWorking] = useState(false);
  async function update(action: () => Promise<boolean>) {
    if (pending || working || retryRequired) return;
    setWorking(true);
    try { await action(); } finally { setWorking(false); }
  }
  return (
    <article className={`${styles.row}${selected ? "" : ` ${styles.unselected}`}`}>
      <input className={styles.checkbox} type="checkbox" checked={selected}
        disabled={!item.canCheckout || pending}
        aria-label={`Pilih ${item.name}`} onChange={onSelect} />
      <Link className={styles.artwork} href={item.slug ? `/products/${item.slug}` : "/shop"} tabIndex={-1} aria-hidden="true">
        <ProductArtwork product={item} size="mini" />
      </Link>
      <div className={styles.productCopy}>
        <Link className={styles.productName} href={item.slug ? `/products/${item.slug}` : "/shop"}>{item.name}</Link>
        <span className={styles.productType}>Produk digital</span>
        <span className={styles.unitPrice}><strong>{formatRupiah(item.price)}</strong> / unit</span>
        {item.canCheckout && !working && !retryRequired ? <Link className={styles.rowCheckout} href={checkoutHref(item)} aria-disabled={pending} onClick={event => { if (pending) event.preventDefault(); }}>Checkout produk ini <Icon name="arrow-right" size={13} aria-hidden="true" /></Link> : <span>{working ? "Menyimpan perubahan..." : "Periksa ketersediaan atau kurangi jumlah sebelum checkout."}</span>}
      </div>
      <div className={styles.quantity} role="group" aria-label={`Jumlah ${item.name}`}>
        <button type="button" disabled={pending || retryRequired || item.quantity <= 1} aria-label={`Kurangi jumlah ${item.name}`}
          onClick={() => void update(() => setQuantity(item.id, item.quantity - 1))}><Icon name="minus" size={16} aria-hidden="true" /></button>
        <output aria-label={`Jumlah ${item.name}`}>{item.quantity}</output>
        <button type="button" disabled={pending || retryRequired || item.quantity >= item.maxQuantity} aria-label={`Tambah jumlah ${item.name}`}
          onClick={() => void update(() => setQuantity(item.id, item.quantity + 1))}><Icon name="plus" size={16} aria-hidden="true" /></button>
      </div>
      <strong className={styles.lineTotal}>{formatRupiah(item.price * item.quantity)}</strong>
      <button className={styles.remove} type="button" disabled={pending || retryRequired} aria-label={`Hapus ${item.name}`} title="Hapus produk"
        onClick={() => void update(() => remove(item.id))}><Icon name="trash" size={19} aria-hidden="true" /></button>
    </article>
  );
}

function CartRecommendations({ products }: { products: StorefrontProduct[] }) {
  const { items } = useCart();
  const rail = useRef<HTMLDivElement>(null);
  const recommendations = products.filter(product => productCanEnterCart(product) && !items.some(item => item.id === product.id)).slice(0, 8);
  if (!recommendations.length) return null;
  return (
    <section className={styles.recommendations} aria-labelledby="cart-recommendations-title">
      <div className={styles.recommendationHeading}>
        <h2 id="cart-recommendations-title">Mungkin kamu juga tertarik</h2>
        <div className={styles.railControls}>
          <button type="button" aria-label="Rekomendasi sebelumnya" onClick={() => rail.current?.scrollBy({left: -340, behavior: "smooth"})}><Icon name="chevron-left" size={19} /></button>
          <button type="button" aria-label="Rekomendasi berikutnya" onClick={() => rail.current?.scrollBy({left: 340, behavior: "smooth"})}><Icon name="chevron-right" size={19} /></button>
        </div>
      </div>
      <div className={styles.recommendationRail} ref={rail}>
        {recommendations.map(product => (
          <article className={`${styles.recommendation} product-card`} key={product.id}>
            <Link className={styles.recommendationImage} href={`/products/${product.slug}`} tabIndex={-1} aria-hidden="true"><ProductArtwork product={product} size="mini" /></Link>
            <div><Link href={`/products/${product.slug}`}>{product.name}</Link><strong>{formatRupiah(product.price)}</strong></div>
            <AddToCartButton product={product} iconOnly />
          </article>
        ))}
      </div>
    </section>
  );
}

export function CartWorkspace({ products }: { products: StorefrontProduct[] }) {
  const { clear, hydrated, items, pending, error, retryRequired, refresh, retry } = useCart();
  const [excluded, setExcluded] = useState<string[]>([]);
  const clearDialog = useRef<HTMLDialogElement>(null);
  const checkoutDialog = useRef<HTMLDialogElement>(null);
  const selected = items.filter(item => !excluded.includes(item.id) && item.canCheckout);
  const selectableCount = items.filter(item => item.canCheckout).length;
  const subtotal = selected.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const unitCount = selected.reduce((sum, item) => sum + item.quantity, 0);
  const singleItem = selected.length === 1 ? selected[0] : null;

  function toggle(id: string) {
    setExcluded(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  }

  return (
    <>
      <SiteHeader />
      <main className={`storefront-main ${styles.page}`}>
        <div className={styles.heading}>
          <PageHeading
            breadcrumbs={<><Link href="/">Home</Link> / Keranjang</>}
            title="Cek keranjangmu."
            description="Pastikan produk dan jumlahnya sudah sesuai sebelum kamu melanjutkan checkout."
            imageAlt="Ilustrasi keranjang produk digital" imageFit="contain" imageMode="background"
            imageTreatment="natural" imageUrl="/headings/cart-heading.webp"
          />
        </div>
        <div className={`${styles.content} page-width`}>
          <div className={styles.panelFooter}><span>Kelola keranjang akunmu.</span><button className="button button-quiet" type="button" disabled={pending || (!hydrated && !error)} onClick={() => retryRequired ? void retry() : void refresh()}>{pending ? "Menyimpan..." : retryRequired ? "Coba ulang penyimpanan" : "Perbarui keranjang"}</button></div>
          {error && !hydrated ? <section className={styles.empty}><h2>Keranjang belum dapat dimuat</h2><p role="alert">{error}</p><Link className="button button-primary" href="/account">Buka akun</Link></section> : !hydrated ? (
            <CartSkeleton />
          ) : items.length === 0 ? (
            <section className={styles.empty}>
              <span className={styles.emptyIcon}><Icon name="cart" size={34} aria-hidden="true" /></span>
              <h2>Keranjangmu masih kosong</h2>
              <p>Yuk, temukan produk digital yang kamu butuhkan.</p>
              <Link className="button button-primary" href="/shop">Mulai belanja <Icon name="arrow-right" size={18} /></Link>
            </section>
          ) : (
            <div className={styles.layout}>
              <section className={styles.panel} aria-labelledby="cart-products-title">
                <div className={styles.panelHeader}>
                  <h2 id="cart-products-title">{items.length} produk di keranjang</h2>
                  <button className={styles.clear} type="button" disabled={pending || retryRequired} onClick={() => clearDialog.current?.showModal()}><Icon name="trash" size={18} aria-hidden="true" /> Kosongkan keranjang</button>
                </div>
                <div className={styles.selectAll}>
                  <label><input className={styles.checkbox} type="checkbox" disabled={!selectableCount || pending} checked={selectableCount > 0 && selected.length === selectableCount}
                    ref={element => { if (element) element.indeterminate = selected.length > 0 && selected.length < selectableCount; }}
                    onChange={() => setExcluded(selected.length === selectableCount ? items.map(item => item.id) : [])} /> Pilih semua</label>
                  <span>{selected.length} produk dipilih</span>
                </div>
                <div className={styles.rows}>
                  {items.map(item => <CartProductRow key={item.id} item={item} selected={!excluded.includes(item.id) && item.canCheckout} onSelect={() => toggle(item.id)} />)}
                </div>
                <div className={styles.panelFooter}>
                  <Link href="/shop"><Icon name="chevron-left" size={18} aria-hidden="true" /> Lanjut belanja</Link>
                  <span><Icon name="shield-check" size={19} aria-hidden="true" /> Akses produk lewat pesanan pribadimu.</span>
                </div>
              </section>
              <aside className={styles.summary} aria-labelledby="cart-summary-title">
                <h2 id="cart-summary-title"><Icon name="receipt" size={25} aria-hidden="true" /> Ringkasan belanja</h2>
                <dl className={styles.totals} aria-live="polite">
                  <div><dt>Subtotal ({unitCount} unit)</dt><dd>{formatRupiah(subtotal)}</dd></div>
                  <div><dt>Biaya / kode unik</dt><dd>Dihitung di invoice</dd></div>
                  <div className={styles.total}><dt>Estimasi belanja</dt><dd>{formatRupiah(subtotal)}</dd></div>
                </dl>
                {singleItem && !pending && !retryRequired ? (
                  <Link className={`button button-primary ${styles.primary}`} href={checkoutHref(singleItem)}>Lanjut checkout <Icon name="arrow-right" size={19} aria-hidden="true" /></Link>
                ) : (
                  <button className={`button button-primary ${styles.primary}`} type="button" disabled={pending || retryRequired || !selected.length}
                    onClick={() => checkoutDialog.current?.showModal()}>Lanjut checkout <Icon name="arrow-right" size={19} aria-hidden="true" /></button>
                )}
                <Link className={styles.secondary} href="/shop">Lanjut belanja</Link>
                <p className={styles.checkoutNote}>{selected.length ? "Pembayaran dilakukan per produk. Harga, jumlah, dan stok diperiksa kembali saat checkout." : "Pilih produk yang ingin kamu beli terlebih dahulu."}</p>
                <ul className={styles.benefits}>
                  <li><Icon name="bolt" size={22} aria-hidden="true" /><span>Produk diproses setelah pembayaran terverifikasi.</span></li>
                  <li><Icon name="receipt" size={22} aria-hidden="true" /><span>Unduh produk dari halaman pesananmu.</span></li>
                  <li><Icon name="shield-check" size={22} aria-hidden="true" /><span>Pesanan dilindungi akses akun pembeli.</span></li>
                </ul>
              </aside>
            </div>
          )}
          {hydrated ? <CartRecommendations products={products} /> : null}
        </div>
      </main>
      <SiteFooter />
      <dialog ref={clearDialog} className={styles.dialog} aria-labelledby="clear-cart-title" onCancel={event => { if (pending) event.preventDefault(); }}>
        <h2 id="clear-cart-title">Kosongkan keranjang?</h2>
        <p>Semua produk akan dihapus dari keranjang ini.</p>
        <div className={styles.dialogActions}>
          <button className="button button-quiet" type="button" disabled={pending} onClick={() => clearDialog.current?.close()}>Batal</button>
          <button className={`button ${styles.danger}`} type="button" disabled={pending || retryRequired} onClick={async () => { if (await clear()) { setExcluded([]); clearDialog.current?.close(); } }}>{pending ? "Mengosongkan..." : "Ya, kosongkan"}</button>
        </div>
      </dialog>
      <dialog ref={checkoutDialog} className={styles.dialog} aria-labelledby="checkout-cart-title">
        <div className={styles.dialogHeading}><h2 id="checkout-cart-title">Bayar produk yang mana dulu?</h2><button className={styles.remove} type="button" aria-label="Tutup pilihan checkout" onClick={() => checkoutDialog.current?.close()}><Icon name="x" size={20} /></button></div>
        <p>Setiap produk punya invoice sendiri. Produk lainnya tetap ada di keranjang.</p>
        <div className={styles.checkoutChoices}>{selected.map(item => <Link href={checkoutHref(item)} key={item.id}><span>{item.name}<small>{item.quantity} unit · {formatRupiah(item.price * item.quantity)}</small></span><Icon name="arrow-right" size={20} aria-hidden="true" /></Link>)}</div>
      </dialog>
    </>
  );
}
