import type { StorefrontOrderDetail } from "@/lib/store-api-contract";
import { Icon } from "@/components/ui/icon";
import { InstructionText, safeGuidanceUrl } from "@/components/orders/instruction-text";

type OrderResourcesProps = Pick<StorefrontOrderDetail, "invoiceNumber" | "guidance" | "attachments">;
export function OrderResources({ invoiceNumber, guidance, attachments }: OrderResourcesProps) {
  if (guidance.length === 0 && attachments.length === 0) return null;
  return <section className="claim-resources" aria-labelledby="claim-resources-title">
    <div className="claim-section-heading"><span><Icon name="receipt" size={23} aria-hidden="true" /></span><div><h2 id="claim-resources-title">Cara claim & penggunaan</h2><p>Ikuti panduan produk setelah mengambil file atau kode pesananmu.</p></div></div>
    <div className="claim-resource-grid">
      {guidance.map(item => {
        const redeemUrl = safeGuidanceUrl(item.redeemUrl);
        return <article className="claim-guide-card" key={item.productId}>
          <div className="claim-product-heading"><span><Icon name="cube" size={20} aria-hidden="true" /></span><div><small>PANDUAN PRODUK</small><h3>{item.productName}</h3></div></div>
          {item.text ? <InstructionText text={item.text} entities={item.entities} /> : <p className="claim-empty-copy">Buka tempat claim dan ikuti petunjuk pada halaman tujuan. Siapkan file atau kode produk dari pesanan ini.</p>}
          {redeemUrl ? <div className="claim-destination"><div><span>Tempat claim / aktivasi</span><strong>{new URL(redeemUrl).hostname}</strong></div><a className="button button-primary" href={redeemUrl} target="_blank" rel="noopener noreferrer">Buka tempat claim <Icon name="arrow-right" size={17} aria-hidden="true" /></a><small>Terbuka di tab baru. Ikuti petunjuk produk sebelum memasukkan kode.</small></div> : null}
        </article>;
      })}
      {attachments.length > 0 ? <article className="claim-attachment-card"><div className="claim-product-heading"><span><Icon name="receipt" size={20} aria-hidden="true" /></span><div><small>LAMPIRAN</small><h3>File panduan</h3></div></div><p>Dokumen pendamping untuk produk yang kamu beli.</p><div className="claim-attachment-list">{attachments.map(item => <div key={item.productId}><span><strong>{item.filename}</strong><small>{item.productName}</small></span><a className="button button-quiet" href={`/api/orders/${encodeURIComponent(invoiceNumber)}/attachments/${encodeURIComponent(item.productId)}`}>Download <Icon name="arrow-right" size={15} aria-hidden="true" /></a></div>)}</div></article> : null}
    </div>
  </section>;
}
