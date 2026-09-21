import styles from "./cart-skeleton.module.css";

export function CartSkeleton({ compact = false }: { compact?: boolean }) {
  return <div className={compact ? styles.compact : styles.layout} role="status" aria-label="Memuat keranjang" aria-busy="true">
    <section className={styles.panel} aria-hidden="true">
      {!compact ? <div className={`${styles.bar} ${styles.heading}`} /> : null}
      {Array.from({ length: compact ? 2 : 3 }, (_, index) => <div className={styles.row} key={index}>
        <div className={`${styles.bar} ${styles.image}`} />
        <div className={styles.copy}><div className={styles.bar} /><div className={`${styles.bar} ${styles.short}`} /><div className={`${styles.bar} ${styles.price}`} /></div>
        {!compact ? <div className={`${styles.bar} ${styles.quantity}`} /> : null}
      </div>)}
    </section>
    {!compact ? <aside className={styles.panel} aria-hidden="true"><div className={`${styles.bar} ${styles.heading}`} /><div className={styles.totals}>{[0, 1, 2].map(index => <div className={styles.bar} key={index} />)}</div><div className={`${styles.bar} ${styles.button}`} /></aside> : null}
  </div>;
}
