"use client";
import { Icon } from "@/components/ui/icon";
import Image from "next/image";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./sms.module.css";
export function SmsPanel({ as: Tag = "section", className = "", ...props }: ComponentPropsWithoutRef<"section"> & { as?: "section" | "aside" }) {
  return <Tag {...props} className={`${styles.panel} ${className}`} />;
}
export function SmsWaitingIllustration({ size = 120 }: { size?: number }) {
  return <Image className={styles.waitingArt} src="/sms/waiting.webp" width={size} height={size} sizes={`${size}px`} alt="" />;
}
export function SmsEmptyState({ title, children }: { title: string; children: ReactNode }) {
  return <div className={styles.empty}><SmsWaitingIllustration size={160} /><h2>{title}</h2>{children}</div>;
}
export const smsStatusLabel = (status: string) => ({ PROCESSING: "Menyiapkan nomor", ACTIVE: "Menunggu SMS", COMPLETED: "Kode diterima", REFUNDED: "Saldo dikembalikan", CANCELLED: "Dibatalkan", EXPIRED: "Kedaluwarsa", FAILED: "Tidak berhasil" })[status] || status;
export function SmsStatusBadge({ status, waiting = false }: { status: string; waiting?: boolean }) {
  return <span className={styles.status} data-status={waiting ? "ACTIVE" : status}>{waiting ? "Menunggu SMS" : smsStatusLabel(status)}</span>;
}
export function SmsCopyButton({ value, label, primary = false, onNotice }: { value: string; label: string; primary?: boolean; onNotice: (message: string) => void }) {
  async function copy() {
    try { await navigator.clipboard.writeText(value); onNotice("Berhasil disalin."); }
    catch { onNotice("Pilih teks nomor atau kode untuk menyalinnya secara manual."); }
  }
  return <button className={`button ${primary ? "button-primary" : "button-quiet"}`} onClick={copy}><Icon name="copy" size={17} />{label}</button>;
}
