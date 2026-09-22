"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Radio, RefreshCw } from "lucide-react";

const PAGE_REFRESH_MS = 30_000;

export function InventoryAutoRefresh({
  autoCheckEnabled,
  intervalSeconds,
}: {
  autoCheckEnabled: boolean;
  intervalSeconds: number;
}) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, PAGE_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return (
    <div className="inventory-live-status" role="status">
      <span className="inventory-live-icon">
        {autoCheckEnabled ? (
          <Radio aria-hidden="true" size={18} />
        ) : (
          <RefreshCw aria-hidden="true" size={18} />
        )}
      </span>
      <div>
        <strong>
          {autoCheckEnabled ? "Auto-check akun aktif" : "Auto-check akun nonaktif"}
        </strong>
        <span>
          {autoCheckEnabled
            ? `Status banned dan quota ditargetkan dicek tiap ${intervalSeconds} detik secara bertahap.`
            : "Gunakan Check akun untuk memperbarui status secara manual."}
          {" "}Tampilan halaman diperbarui tiap 30 detik.
        </span>
      </div>
    </div>
  );
}
