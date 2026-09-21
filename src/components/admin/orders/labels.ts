export function orderDetailDateLabel(value: Date | null) {
  return value
    ? value.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })
    : "-";
}

export function notificationStatusLabel(status: string) {
  if (status === "PENDING") return "Menunggu";
  if (status === "PROCESSING") return "Diproses";
  if (status === "SENT") return "Terkirim";
  if (status === "FAILED") return "Gagal";
  if (status === "MANUAL_REVIEW") return "Perlu review";
  return status;
}

export function deliveryReceiptStatusLabel(status: string) {
  if (status === "SENT") return "Upload diterima Telegram";
  if (status === "SENDING") return "Sedang dikirim";
  if (status === "FAILED") return "Gagal";
  if (status === "UNKNOWN") return "Perlu review";
  return status;
}
