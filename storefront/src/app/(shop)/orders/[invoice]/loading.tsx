import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import styles from "@/components/orders/order-detail.module.css";

export default function LoadingInvoice() {
  return <><SiteHeader active="orders" /><main className="storefront-main order-detail-page page-width" role="status" aria-label="Memuat detail pesanan" aria-busy="true"><div aria-hidden="true">
    <div className={styles.skeleton} style={{ width:"70%", height:34, marginBottom:18 }} />
    <div className={styles.skeleton} style={{ width:200, height:16, marginBottom:28 }} />
    <div className={styles.skeleton} style={{ height:140, marginBottom:24 }} />
    <div className={styles.layout}><div className={styles.primary}>{[0,1].map(item => <div className={styles.skeleton} key={item} style={{ height:190 }} />)}</div><div className={styles.skeleton} style={{ height:300 }} /></div>
  </div></main><SiteFooter /></>;
}
