import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import styles from "./account-required.module.css";

export function AccountRequired({ label, returnTo, description, imageSrc = "/auth/account-required.png" }: {
  label: string; returnTo: string; description?: string; imageSrc?: string;
}) {
  return <main className={styles.page}><div className={styles.content}>
    <div className={styles.art}><Image src={imageSrc} alt="Ilustrasi akun pribadi untuk mengakses pesanan" fill priority sizes="(max-width: 600px) 90vw, 470px" /></div>
    <nav className={styles.breadcrumbs} aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><span>{label}</span></nav>
    <h1>Oops, kamu belum login.</h1>
    <p className={styles.description}>{description ?? "Masuk terlebih dahulu untuk melihat dan mengelola semua pesananmu."}</p>
    <Link className={styles.primary} href={`/sign-in?redirect_url=${encodeURIComponent(returnTo)}`}>Masuk ke akun <Icon name="arrow-right" size={19} aria-hidden="true" /></Link>
    <Link className={styles.back} href="/shop">Kembali belanja</Link>
    <p className={styles.note}>Masuk untuk melanjutkan ke {label.toLowerCase()}.</p>
  </div></main>;
}
