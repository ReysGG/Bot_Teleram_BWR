export const BINANCE_INTERNAL_LEDGER_STATUSES = [
  "AWAITING_ORDER_ID",
  "VERIFYING",
  "VERIFIED",
  "CONFIRMED",
  "REJECTED",
  "EXPIRED",
] as const;

export type BinanceInternalLedgerStatus =
  (typeof BINANCE_INTERNAL_LEDGER_STATUSES)[number];

export function parseBinanceInternalLedgerStatus(value: string | undefined) {
  return BINANCE_INTERNAL_LEDGER_STATUSES.find((status) => status === value);
}

export function binanceInternalStatusPresentation(
  status: BinanceInternalLedgerStatus,
  failureReason?: string | null,
) {
  if (status === "CONFIRMED" && failureReason?.startsWith("MANUAL_APPROVAL: ")) return { label: "Lunas · manual", tone: "good", diagnostic: "Disetujui admin: " + failureReason.slice(17) } as const;
  if (status === "AWAITING_ORDER_ID") {
    return { label: "Menunggu Order ID", tone: "neutral", diagnostic: "Pembeli belum mengirim Order ID Binance Pay." } as const;
  }
  if (status === "VERIFYING") {
    return { label: "Memverifikasi", tone: "warn", diagnostic: failureReason?.trim() || "Worker sedang mencocokkan histori transaksi masuk akun penerima." } as const;
  }
  if (status === "VERIFIED") {
    return { label: "Terverifikasi", tone: "good", diagnostic: "Order ID, nominal, penerima, mata uang, dan waktu transaksi sudah cocok." } as const;
  }
  if (status === "CONFIRMED") {
    return { label: "Lunas", tone: "good", diagnostic: "Pembayaran dan order sudah dikonfirmasi." } as const;
  }
  if (status === "REJECTED") {
    return { label: "Ditolak", tone: "bad", diagnostic: failureReason?.trim() || "Transaksi tidak sesuai dengan invoice." } as const;
  }
  return { label: "Kedaluwarsa", tone: "neutral", diagnostic: failureReason?.trim() || "Batas verifikasi pembayaran telah berakhir." } as const;
}

export function canRecheckBinanceInternalAttempt(input: {
  status: BinanceInternalLedgerStatus;
  submittedOrderId: string | null;
}) {
  return Boolean(input.submittedOrderId) && (
    input.status === "VERIFYING" || input.status === "VERIFIED"
  );
}
