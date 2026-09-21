export function ProductSales({ count }: { count?: number }) {
  if (count === undefined || !Number.isSafeInteger(count) || count < 0) return null;
  return <span className="product-sales" title="Unit pesanan yang sudah dibayar melalui website dan Telegram, tidak termasuk refund">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 8 8-4 8 4v9l-8 4-8-4V8Z" /><path d="m4 8 8 4 8-4M12 12v9m-4-15 8 4" /></svg>
    {new Intl.NumberFormat("id-ID").format(count)} terjual
  </span>;
}
