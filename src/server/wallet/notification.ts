import { formatRupiah } from "@/server/utils/format";

export type WalletAdjustmentNotificationPayload = {
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  note: string | null;
};

export function walletAdjustmentDedupeKey(transactionId: string): string {
  return `wallet-adjustment:${transactionId}`;
}

export function serializeWalletAdjustmentNotification(
  payload: WalletAdjustmentNotificationPayload,
): string {
  return JSON.stringify(payload);
}

export function walletAdjustmentNotificationText(rawPayload: string): string {
  const payload = JSON.parse(rawPayload) as Partial<WalletAdjustmentNotificationPayload>;
  if (
    !Number.isSafeInteger(payload.amount) ||
    payload.amount === 0 ||
    !Number.isSafeInteger(payload.balanceBefore) ||
    !Number.isSafeInteger(payload.balanceAfter)
  ) {
    throw new Error("Wallet adjustment notification is invalid");
  }
  const amount = Number(payload.amount);
  const credit = amount > 0;
  return [
    credit ? "💰 Saldo ditambahkan oleh admin" : "💸 Saldo dikurangi oleh admin",
    "",
    `Nominal: ${credit ? "+" : "-"}${formatRupiah(Math.abs(amount))}`,
    `Saldo sebelumnya: ${formatRupiah(Number(payload.balanceBefore))}`,
    `Saldo sekarang: ${formatRupiah(Number(payload.balanceAfter))}`,
    `Catatan: ${payload.note?.trim() || "Penyesuaian saldo oleh admin"}`,
  ].join("\n");
}
