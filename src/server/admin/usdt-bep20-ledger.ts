export const USDT_BEP20_LEDGER_STATUSES = [
  "AWAITING_TX_HASH",
  "VERIFYING",
  "PENDING_CONFIRMATIONS",
  "VERIFIED",
  "CONFIRMED",
  "REJECTED",
  "EXPIRED",
] as const;

export type UsdtBep20LedgerStatus =
  (typeof USDT_BEP20_LEDGER_STATUSES)[number];

export function parseUsdtBep20LedgerStatus(value: string | undefined) {
  return USDT_BEP20_LEDGER_STATUSES.find((status) => status === value);
}

export function usdtBep20StatusPresentation(
  status: UsdtBep20LedgerStatus,
  failureReason?: string | null,
) {
  if (status === "CONFIRMED" && failureReason?.startsWith("MANUAL_APPROVAL: ")) return { label: "Lunas · manual", tone: "good", diagnostic: "Disetujui admin: " + failureReason.slice(17) } as const;
  if (status === "AWAITING_TX_HASH") return { label: "Menunggu hash", tone: "neutral", diagnostic: "Pembeli belum mengirim hash transaksi." } as const;
  if (status === "VERIFYING") return { label: "Memverifikasi", tone: "warn", diagnostic: "Verifier sedang membaca receipt dan transfer log." } as const;
  if (status === "PENDING_CONFIRMATIONS") return { label: "Menunggu blok", tone: "warn", diagnostic: "Transfer cocok dan sedang menunggu konfirmasi blok." } as const;
  if (status === "VERIFIED") return { label: "Terverifikasi", tone: "good", diagnostic: "Transfer lolos verifikasi; konfirmasi order sedang diproses." } as const;
  if (status === "CONFIRMED") return { label: "Lunas", tone: "good", diagnostic: "Pembayaran on-chain dan order sudah dikonfirmasi." } as const;
  if (status === "REJECTED") return { label: "Ditolak", tone: "bad", diagnostic: failureReason?.trim() || "Transaksi tidak memenuhi syarat invoice." } as const;
  return { label: "Kedaluwarsa", tone: "neutral", diagnostic: failureReason?.trim() || "Batas waktu verifikasi transaksi sudah berakhir." } as const;
}

export function canRecheckUsdtBep20Attempt(input: {
  status: UsdtBep20LedgerStatus;
  txHash: string | null;
}) {
  return Boolean(input.txHash) && (
    input.status === "VERIFYING"
    || input.status === "PENDING_CONFIRMATIONS"
    || input.status === "VERIFIED"
  );
}
