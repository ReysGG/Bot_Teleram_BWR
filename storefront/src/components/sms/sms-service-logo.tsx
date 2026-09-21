"use client";
import Image from "next/image";
import { Icon } from "@/components/ui/icon";
import { smsBrandLogo } from "@/lib/sms-brand";
import styles from "./sms.module.css";
export function SmsServiceLogo({ name, size = 32 }: { name: string; size?: number }) {
  const source = smsBrandLogo(name);
  return <span className={styles.brandLogo} aria-hidden="true">{source ? <Image src={source} alt="" width={size} height={size} unoptimized loading="lazy" /> : <Icon name="phone" size={size} />}</span>;
}
