"use client";

import { ConfirmationModal } from "@/components/ui/confirmation-modal";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useRef, useState } from "react";
import { ProductArtwork } from "@/components/catalog/product-artwork";
import { Icon } from "@/components/ui/icon";
import type { StorefrontProduct } from "@/lib/catalog-types";
import { formatRupiah, productAvailabilityLabel } from "@/lib/catalog-types";

const paymentCopy: Record<string, [string, string]> = {
  Wallet: ["Wallet BWR Tele", "Gunakan saldo yang tersedia pada email ini"],
  "Saldo + QRIS": ["Saldo + QRIS", "Gunakan saldo terlebih dahulu, bayar sisanya lewat QRIS"],
  QRIS: ["QRIS", "Bayar menggunakan aplikasi bank atau e-wallet"],
  "Bank Jago": ["Bank Jago", "Transfer nominal invoice yang tepat"],
  "Binance Pay": ["Binance Pay", "Bayar ke Binance ID yang tertera"],
  "USDT BEP20": ["USDT BEP20", "Kirim nominal tepat melalui jaringan BNB Smart Chain"],
};

const paymentCode: Record<string, string> = {
  Wallet: "WALLET",
  "Saldo + QRIS": "WALLET_QRIS",
  QRIS: "DANA",
  "Bank Jago": "JAGO_TRANSFER",
  "Binance Pay": "BINANCE_INTERNAL",
  "USDT BEP20": "USDT_BEP20",
};

const checkoutErrors: Record<string, string> = {
  sign_in_required: "Sesi login berakhir. Masuk kembali sebelum checkout.",
  account_setup_required: "Hubungkan akun belanja terlebih dahulu dari halaman Akun.",
  insufficient_balance: "Saldo berubah atau tidak cukup. Refresh halaman dan pilih metode pembayaran kembali.",
  invalid_checkout: "Periksa kembali email, password, jumlah, dan metode pembayaran.",
  invalid_credentials: "Email ini sudah pernah digunakan dengan password yang berbeda.",
  active_invoice: "Masih ada invoice aktif untuk email ini. Buka halaman Pesanan untuk melanjutkan.",
  stock_unavailable: "Stok sedang tidak tersedia. Coba kurangi jumlah atau pilih produk lain.",
  payment_unavailable: "Metode pembayaran ini sedang tidak tersedia.",
  rate_limited: "Terlalu banyak percobaan checkout. Tunggu sebentar lalu coba lagi.",
};

export function ProductCheckout({
  readOnly = false,
  accountMode = false,
  account,
  initialQuantity = 1,
  paymentMethods,
  product,
}: {
  readOnly?: boolean;
  accountMode?: boolean;
  account?: { contactMasked: string; balance: number; walletEnabled: boolean; mixedQrisEnabled: boolean };
  initialQuantity?: number;
  paymentMethods: string[];
  product: StorefrontProduct;
}) {
  const router = useRouter();
  const methods = [...paymentMethods.filter((method) => paymentCode[method]).sort((a, b) => Number(b === "QRIS") - Number(a === "QRIS")),
    ...(account?.walletEnabled && account.balance > 0 ? ["Wallet"] : []),
    ...(account?.mixedQrisEnabled && account.balance > 0 && paymentMethods.includes("QRIS") ? ["Saldo + QRIS"] : []),
  ];
  const quantityCap = product.readyStock > 0
    ? Math.max(1, Math.min(product.readyStock, 10))
    : product.preorderEnabled ? 10 : 1;
  const normalizedInitialQuantity = Math.min(
    quantityCap,
    Math.max(1, Math.trunc(initialQuantity) || 1),
  );
  const idempotencyKey = useRef("web:" + globalThis.crypto.randomUUID());
  const [quantity, setQuantity] = useState(normalizedInitialQuantity);
  const [selectedPayment, setSelectedPayment] = useState(methods[0] ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [confirmation, setConfirmation] = useState<{ quantity: number; selectedPayment: string; walletUsed: number; subtotal: number } | null>(null);
  const subtotal = product.price * quantity;
  const walletUsed = selectedPayment === "Wallet" ? subtotal : selectedPayment === "Saldo + QRIS" ? Math.min(account?.balance ?? 0, subtotal) : 0;
  const canCheckout = !readOnly && methods.length > 0 && (!accountMode || Boolean(account)) &&
    (selectedPayment !== "Wallet" || (account?.balance ?? 0) >= subtotal) &&
    (product.readyStock > 0 || product.preorderEnabled);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCheckout || inFlight.current || !selectedPayment) return;
    const quote = { quantity, selectedPayment, walletUsed, subtotal };
    if (walletUsed > 0) { setConfirmation(quote); return; }
    void createInvoice(quote);
  }

  async function createInvoice(quote: { quantity: number; selectedPayment: string }) {
    if (!canCheckout || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(!accountMode ? { email, password } : {}),
          productId: product.id,
          quantity: quote.quantity,
          paymentMethod: paymentCode[quote.selectedPayment],
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const result = await response.json() as {
        ok?: boolean;
        code?: string;
        order?: { invoiceNumber?: string };
      };
      if (!response.ok || !result.ok || !result.order?.invoiceNumber) {
        setError(checkoutErrors[result.code ?? ""] ?? "Checkout belum dapat diproses. Coba lagi.");
        return;
      }
      router.push("/orders/" + encodeURIComponent(result.order.invoiceNumber));
    } catch {
      setError("Koneksi bermasalah. Coba lagi tanpa menutup halaman ini.");
    } finally {
      inFlight.current = false;
      setConfirmation(null);
      setSubmitting(false);
    }
  }

  return (
    <>
    <form className="checkout-layout page-width" onSubmit={submit} aria-busy={submitting}>
      <div className="checkout-steps">
        <article className="checkout-panel checkout-product-panel">
          <div className="checkout-step-title"><span>1</span><div><h2>Produk</h2><p>Pastikan produk dan jumlahnya sudah sesuai.</p></div></div>
          <div className="checkout-product-row">
            <ProductArtwork product={product} size="mini" />
            <div className="checkout-product-copy"><strong>{product.name}</strong><small className={`stock-pill stock-${product.availability.toLowerCase()}`}>{productAvailabilityLabel(product)}</small><span>{formatRupiah(product.price)} <small>/ produk</small></span></div>
            <label className="checkout-quantity-field">
              <span>Jumlah</span>
              <select aria-label="Jumlah produk" disabled={submitting} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
                {Array.from({ length: quantityCap }, (_, index) => index + 1).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
        </article>

        <article className="checkout-panel">
          <div className="checkout-step-title"><span>2</span><div><h2>Informasi pembeli</h2><p>{accountMode ? "Pesanan dan produk tersimpan dalam akun belanjamu." : "Email dan password dipakai untuk membuka invoice serta mengambil produk."}</p></div></div>
          {accountMode ? <div className="account-checkout-identity"><div className="checkout-buyer"><span className="checkout-buyer-icon"><Icon name="user" size={22} aria-hidden="true" /></span><div><small>Akun penerima pesanan</small><strong>{account?.contactMasked}</strong></div><Icon name="shield-check" size={21} aria-hidden="true" /></div><div className="checkout-wallet-info"><span><Icon name="wallet" size={18} aria-hidden="true" /> Saldo refund <strong>{formatRupiah(account?.balance ?? 0)}</strong></span><Link href="/account/wallet">Riwayat <Icon name="arrow-right" size={14} aria-hidden="true" /></Link></div></div> : <>
          <div className="checkout-customer-fields">
            <label>
              <span>Email</span>
              <input disabled={submitting} autoComplete="email" maxLength={254} placeholder="contoh@email.com" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label>
              <span>Buat password pesanan</span>
              <input disabled={submitting} autoComplete="new-password" maxLength={64} minLength={8} placeholder="Minimal 8 karakter" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          </div>
        <p className="checkout-password-note">Gunakan password yang mudah kamu ingat. Password tidak dapat dilihat oleh admin dan tidak disimpan dalam bentuk asli.</p>
          </>}
        </article>

        <article className="checkout-panel checkout-payment-panel">
          <div className="checkout-step-title"><span>3</span><div><h2>Metode pembayaran</h2><p>Pilih cara pembayaran yang paling nyaman untukmu.</p></div></div>
          {methods.length > 0 ? (
            <div className="payment-method-list" role="radiogroup" aria-label="Metode pembayaran">
              {methods.map((method) => {
                const copy = paymentCopy[method] ?? [method, "Ikuti petunjuk pembayaran setelah melanjutkan"];
                return (
                  <label className={selectedPayment === method ? "is-selected" : ""} key={method}>
                    <input disabled={submitting} checked={selectedPayment === method} name="payment-method" type="radio" value={method} onChange={() => setSelectedPayment(method)} />
                    <span className={`payment-icon payment-icon-${paymentCode[method]?.toLowerCase()}`} aria-hidden="true">{method === "QRIS" ? <Icon name="grid" size={22} /> : method === "Wallet" || method === "Saldo + QRIS" ? <Icon name="wallet" size={22} /> : method === "Bank Jago" ? <Icon name="receipt" size={22} /> : method === "USDT BEP20" ? "USDT" : <Icon name="bolt" size={22} />}</span>
                    <span className="payment-method-copy"><strong>{copy[0]}</strong><small>{copy[1]}</small></span>
                    <span className="payment-selection-icon" aria-hidden="true">
                      {selectedPayment === method
                        ? <Icon name="circle-check" size={19} strokeWidth={2.3} />
                        : <Icon name="circle" size={19} strokeWidth={1.8} />}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : <div className="checkout-warning">Belum ada metode pembayaran yang tersedia.</div>}
        </article>
      </div>

      <aside className="checkout-summary">
        <div className="checkout-summary-heading"><div><span className="checkout-summary-icon"><Icon name="receipt" size={21} aria-hidden="true" /></span><h2>Ringkasan pembayaran</h2></div><Link href={"/products/" + product.slug}>Edit</Link></div>
        <div className="checkout-items"><div className="checkout-item"><ProductArtwork product={product} size="mini" /><span><strong>{product.name}</strong><small>{formatRupiah(product.price)} · Qty {quantity}</small></span><b>{formatRupiah(product.price * quantity)}</b></div></div>
        <div className="checkout-totals">
          <div><span>Subtotal</span><strong>{formatRupiah(product.price * quantity)}</strong></div>
          {walletUsed > 0 ? <><div><span>Rencana penggunaan saldo</span><strong>{formatRupiah(walletUsed)}</strong></div><div><span>Sisa sebelum biaya / kode unik</span><strong>{formatRupiah(subtotal - walletUsed)}</strong></div></> : null}
          <div><span>Biaya layanan / kode unik</span><strong>Dihitung saat invoice dibuat</strong></div>
          <div className="checkout-total"><span>Total final</span><strong>Dihitung saat lanjut</strong></div>
        </div>
        {readOnly ? <p className="checkout-warning">Versi uji: pembuatan invoice dan pembayaran belum dibuka.</p> : null}
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        {selectedPayment === "Wallet" && (account?.balance ?? 0) < subtotal ? <p className="form-error">Saldo tidak cukup. Pilih saldo + QRIS atau metode lainnya.</p> : null}
        <button className="button button-primary button-wide" disabled={!canCheckout || submitting} type="submit">
          {submitting ? "Membuat invoice..." : canCheckout ? "Buat invoice" : "Checkout belum tersedia"}
        </button>
        <p className="checkout-fineprint"><Icon name="shield-check" size={16} aria-hidden="true" /> Harga dan stok diperiksa saat invoice dibuat.</p>
        <a className="checkout-help-link" href="https://t.me/davidboysaja" target="_blank" rel="noopener noreferrer">Butuh bantuan? Hubungi admin <Icon name="arrow-right" size={14} aria-hidden="true" /></a>
      </aside>
    </form>
    <ConfirmationModal open={confirmation !== null} title="Gunakan saldo untuk pesanan ini?" pending={submitting} onCancel={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void createInvoice(confirmation); }}>
      <p>Periksa pembagian pembayaran sebelum membuat invoice.</p>
      <strong className="store-confirm-product">{product.name} - {confirmation?.quantity ?? quantity} unit</strong>
      <dl className="store-confirm-totals">
        <div><dt>Total produk</dt><dd>{formatRupiah(confirmation?.subtotal ?? subtotal)}</dd></div>
        <div><dt>Saldo yang digunakan</dt><dd>{formatRupiah(confirmation?.walletUsed ?? walletUsed)}</dd></div>
        {confirmation?.selectedPayment === "Saldo + QRIS" ? <div><dt>Sisa melalui QRIS*</dt><dd>{formatRupiah(confirmation.subtotal - confirmation.walletUsed)}</dd></div> : null}
      </dl>
      <p className="store-confirm-note">{confirmation?.selectedPayment === "Saldo + QRIS" ? "*Belum termasuk biaya layanan / kode unik. " : ""}Saldo, harga, dan stok diperiksa kembali saat invoice dibuat.</p>
    </ConfirmationModal>
    </>
  );
}
