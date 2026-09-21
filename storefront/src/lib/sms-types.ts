export type SmsCatalog = {
  balance: number; walletEnabled: boolean; maintenance: boolean;
  services: Array<{ id: number; name: string }>;
  countries: Array<{ id: number; name: string; code: string; price: number; successRate: number }>;
};
export type SmsOrder = {
  id: string; serviceName: string; countryName: string; countryCode: string | null; price: number;
  status: string; phoneNumber: string | null; otpCode: string | null; fullCode: string | null;
  createdAt: string; expiresAt: string | null; refundedAt: string | null;
};
export const smsMessages: Record<string, string> = {
  sms_disabled: "Layanan SMS OTP website belum aktif. Silakan coba lagi nanti.",
  sms_unavailable: "Layanan SMS sementara tidak dapat diakses. Periksa pesananmu sebelum mencoba membeli kembali.",
  sms_insufficient_balance: "Saldo website belum cukup untuk pembelian ini.",
  sms_price_changed: "Harga baru berubah. Pilih negara kembali dan periksa harga sebelum membeli.",
  sms_maintenance: "Checkout sedang maintenance. Pesanan yang sudah ada tetap dapat dilihat.",
  sms_wallet_disabled: "Pembayaran saldo sedang dinonaktifkan admin.",
  sms_cancel_pending: "Nomor belum dapat dibatalkan. Tunggu sekitar satu menit, lalu coba lagi.",
  sms_cancel_unavailable: "Pesanan ini sudah tidak dapat dibatalkan.",
  sms_order_missing: "Pesanan SMS tidak ditemukan pada akunmu.",
  sms_no_numbers: "Nomor sedang tidak tersedia. Pilih negara atau layanan lain.",
  sms_request_conflict: "Permintaan berbeda memakai referensi yang sama. Periksa riwayat pesananmu.",
  account_setup_required: "Hubungkan akun belanjamu di halaman Akun terlebih dahulu.",
  sign_in_required: "Silakan masuk kembali untuk mengakses SMS OTP.",
  rate_limited: "Terlalu banyak permintaan. Tunggu sebentar sebelum mencoba kembali.",
};
