const STOCK_DOWNLOAD_ERROR_MESSAGES: Record<string, string> = {
  "stock-download-empty": "Pilih minimal satu stok untuk didownload.",
  "stock-download-limit": "ZIP terlalu besar. Download stok terpilih dalam beberapa batch.",
  "stock-download-missing": "Sebagian stok berubah atau sudah tidak tersedia. Muat ulang lalu coba lagi.",
  "stock-download-unavailable": "ZIP gagal dibuat karena ada stok yang tidak dapat didekripsi.",
};

export function stockDownloadErrorMessage(error?: string): string | null {
  if (!error) return null;
  return STOCK_DOWNLOAD_ERROR_MESSAGES[error] ?? null;
}
