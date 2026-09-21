export const STOCK_UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  "admin-origin": "Permintaan upload ditolak oleh pemeriksaan keamanan origin.",
  "admin-session": "Sesi admin sudah berakhir. Login kembali, lalu coba kirim ulang file yang masih dipilih.",
  "invalid-response": "Server memberi respons yang tidak dikenali. Tidak ada upload yang dianggap berhasil.",
  network: "Koneksi ke server terputus. File tetap dipilih dan dapat langsung dicoba kembali.",
  "stock-duplicate": "Semua file atau credential yang dipilih sudah tersimpan di gudang.",
  "stock-empty": "Salah satu file stok kosong.",
  "stock-encryption-key": "Kunci enkripsi stok server tidak valid.",
  "stock-file-count": "Tambahkan minimal satu file atau baris stok. Satu proses dapat menghasilkan hingga 5.000 stok.",
  "stock-lines-too-large": "Teks stok melebihi 1 MB. Pecah menjadi beberapa proses upload.",
  "stock-too-large": "Salah satu file melebihi batas 64 KB.",
  "stock-upload": "Upload stok gagal diproses. Tidak ada hasil yang dianggap berhasil.",
};

export function stockUploadErrorMessage(error: string) {
  return STOCK_UPLOAD_ERROR_MESSAGES[error] ?? STOCK_UPLOAD_ERROR_MESSAGES["stock-upload"];
}
