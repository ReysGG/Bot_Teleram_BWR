import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";
import styles from "@/components/orders/order-detail.module.css";

export function RouteLoading({ label, active }: { label: string; active?: "orders" | "account" | "shop" }) {
  return <><SiteHeader active={active} /><main className="storefront-main page-width" aria-busy="true" role="status" aria-label={label} style={{ paddingBlock: "48px 64px", minHeight: "65vh" }}>
    <p>{label}…</p><div aria-hidden="true">
      <div className={styles.skeleton} style={{ width: "65%", height: 40, marginBottom: 24 }} />
      <div className={styles.skeleton} style={{ height: 130, marginBottom: 24 }} />
      <div className={styles.skeleton} style={{ height: 250 }} />
    </div>
  </main><SiteFooter /></>;
}
