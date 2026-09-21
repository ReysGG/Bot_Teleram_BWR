import type { AdminOrderDetailQuery } from "@/server/admin/orders/detail";

export function OrderNotices({ query }: { query: AdminOrderDetailQuery }) {
  return (
    <>
      {query.notice === "stock-assigned" ? (
        <p className="alert alert-success">
          {Number.parseInt(query.remaining ?? "0", 10) > 0
            ? `File dipilih. Masih perlu ${query.remaining} file sebelum pengiriman dimulai.`
            : "Semua file dipilih dan masuk antrean pengiriman Telegram."}
        </p>
      ) : null}
      {query.notice === "preorder-cancelled" ? (
        <p className="alert alert-success">
          Preorder dibatalkan dan seluruh pembayaran dikembalikan ke wallet pembeli.
        </p>
      ) : null}
      {query.notice === "message-queued" ? (
        <p className="alert alert-success">
          Pesan admin masuk antrean Telegram dan tercatat di riwayat order.
        </p>
      ) : null}
      {query.notice === "payment-confirmed" ? (
        <p className="alert alert-success">
          Pembayaran dikonfirmasi. Stok dan pengiriman diproses secara idempotent.
        </p>
      ) : null}
      {query.notice === "expired-payment-credited" ? (
        <p className="alert alert-success">
          Pembayaran kedaluwarsa dimasukkan ke wallet tanpa mengirim produk.
        </p>
      ) : null}
      {query.notice === "expired-payment-already-credited" ? (
        <p className="alert alert-success">
          Pembayaran expired sudah pernah dimasukkan ke wallet; saldo tidak ditambah dua kali.
        </p>
      ) : null}
      {query.error ? (
        <p className="alert alert-error">
          {query.error === "web-message-unavailable" ? "Pembeli Web menerima produk melalui akun website, bukan pesan Telegram." : query.error === "payment_expired"
            ? "Invoice sudah melewati batas pembayaran. Tunggu status expired, lalu gunakan Add Wallet agar produk tidak terkirim salah."
            : query.error === "provider_recheck_required"
              ? "Metode ini wajib diperiksa melalui verifier provider dan tidak dapat di-approve manual."
              : query.error === "payment_unavailable" || query.error === "payment_not_found"
                ? "Pembayaran tidak lagi memenuhi syarat approval manual. Muat ulang detail order dan periksa status terbaru."
                : query.error === "expired-payment-credit"
                  ? "Pembayaran expired tidak dapat dimasukkan ke wallet. Periksa status, nominal, dan riwayat pengiriman."
                  : query.error === "preorder-cancel"
            ? "Preorder tidak dapat dibatalkan. Pastikan order sudah lunas, masih menunggu stok, dan belum memiliki file."
            : query.error === "admin-message"
              ? "Pesan admin gagal dimasukkan ke antrean Telegram."
              : "File tidak dapat dialokasikan. Pastikan order masih menunggu dan stok sehat."}
        </p>
      ) : null}
    </>
  );
}
