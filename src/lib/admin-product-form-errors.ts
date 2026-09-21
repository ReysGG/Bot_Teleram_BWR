export const PRODUCT_FORM_ERROR_MESSAGES: Record<string, string> = {
  product: "Produk gagal diproses. Periksa nama, harga, deskripsi, grup, dan pengaturan preorder.",
  "product-image": "Gambar gagal diproses. Gunakan PNG, JPG, WebP, atau GIF maksimal 3 MB.",
  "product-attachment": "Panduan atau lampiran gagal diproses. Ukuran maksimal 8 MB.",
  "product-post-delivery": "Instruksi setelah pengiriman tidak valid. Gunakan URL HTTPS dan instruksi maksimal 3.200 karakter.",
  "product-description": "Format deskripsi Indonesia atau English tidak valid. Periksa panjang teks, link HTTPS, dan format yang saling bertumpuk.",
  "admin-session": "Sesi admin sudah berakhir. Login kembali di tab lain, lalu ulangi submit dari draft yang masih terbuka ini.",
  "admin-origin": "Permintaan ditolak oleh pemeriksaan keamanan origin. Muat ulang halaman hanya setelah menyalin draft jika masalah berulang.",
  "invalid-response": "Server memberi respons yang tidak dikenali. Draft belum dikirim ulang dan tetap tersedia di form ini.",
  network: "Koneksi ke server terputus. Periksa internet lalu coba kirim kembali.",
};

export function productFormErrorMessage(error: string) {
  return PRODUCT_FORM_ERROR_MESSAGES[error] ?? PRODUCT_FORM_ERROR_MESSAGES.product;
}
