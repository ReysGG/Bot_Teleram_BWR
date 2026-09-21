import { Icon } from "@/components/ui/icon";

export function SupportCard({ invoice, compact = false }: { invoice?: string; compact?: boolean }) {
  return <aside className={`support-card${compact ? " is-compact" : ""}`}>
    <span className="support-card-icon"><Icon name="send" size={22} aria-hidden="true" /></span>
    <div><strong>Ada kendala dengan pesananmu?</strong><p>Pembayaran sudah dilakukan tetapi invoice kedaluwarsa, produk bermasalah, atau butuh bantuan? Hubungi admin{invoice ? <> dan sertakan invoice <code>{invoice}</code></> : " dan sertakan nomor invoice"}.</p></div>
    <a className="button button-quiet" href="https://t.me/davidboysaja" target="_blank" rel="noopener noreferrer">Hubungi @davidboysaja <Icon name="arrow-right" size={16} aria-hidden="true" /></a>
  </aside>;
}
