"use client";
import { useRouter } from "next/navigation";
import { PrivateFileDownload } from "./private-file-download";
export function DownloadDelivery({ invoice, receipt, filename, bundle = false, downloaded = false }: { invoice: string; receipt?: string; filename: string; bundle?: boolean; downloaded?: boolean }) {
  const router = useRouter();
  return <PrivateFileDownload key={`${invoice}:${receipt ?? "bundle"}`} endpoint={`/api/orders/${encodeURIComponent(invoice)}/deliveries/${bundle ? "bundle" : encodeURIComponent(receipt ?? "")}`} filename={filename} label={bundle ? "Download gabungan" : downloaded ? "Download ulang" : "Download"} onHandedOff={() => router.refresh()} />;
}
