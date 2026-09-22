const PRODUCT_STATUS_ERROR_MESSAGES: Record<string, string> = {
  "admin-session": "Sesi admin sudah berakhir. Login kembali, lalu ulangi perubahan status produk.",
  "admin-origin": "Permintaan ditolak oleh pemeriksaan keamanan origin. Muat ulang halaman lalu coba lagi.",
  "product-status-invalid": "Status produk yang dikirim tidak valid. Muat ulang halaman lalu coba lagi.",
  "product-not-found": "Produk tidak ditemukan. Daftar produk mungkin sudah berubah di tab lain.",
  "invalid-response": "Server memberi respons yang tidak dikenali. Status produk belum dapat dipastikan.",
  network: "Koneksi ke server terputus. Status produk belum diubah; periksa internet lalu coba lagi.",
};

export function productStatusErrorMessage(error: string, activating: boolean) {
  return PRODUCT_STATUS_ERROR_MESSAGES[error]
    ?? (activating
      ? "Produk gagal diaktifkan. Status lama tetap dipertahankan."
      : "Produk gagal dinonaktifkan. Produk masih dapat dibeli sampai perubahan berhasil.");
}
