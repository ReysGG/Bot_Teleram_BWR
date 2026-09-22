# Route map admin dan seller storefront lokal

Semua route berada di `storefront/src/app`. Fitur besar tidak digabung dalam
satu halaman monolitik.

## Admin

- `/admin` — dashboard ringkas
- `/admin/products` — katalog produk
- `/admin/products/new` — produk baru
- `/admin/products/[id]/edit` — edit produk
- `/admin/products/[id]/stock` — stok produk
- `/admin/inventory/available` — stok tersedia
- `/admin/inventory/sold` — stok terjual
- `/admin/inventory/banned` — stok banned
- `/admin/inventory/search` — pencarian isi stok
- `/admin/inventory/[id]` — detail stok
- `/admin/inventory/[id]/edit` — edit stok
- `/admin/inventory/[id]/takeout` — ambil/export stok
- `/admin/seller-products/reviews` — antrean review produk seller
- `/admin/payments/*` — ledger dan rekonsiliasi pembayaran
- `/admin/payment-settings/*` — konfigurasi provider
- `/admin/orders` dan `/admin/orders/[id]` — order dan fulfillment

## Seller

- `/seller` — dashboard seller
- `/seller/products` — produk milik seller
- `/seller/products/new` — draft produk baru
- `/seller/products/[id]` — detail produk
- `/seller/products/[id]/stock` — stok produk seller
- `/seller/sales` — penjualan seller
- `/seller/sales/[id]` — detail penjualan
- `/seller/balance` — saldo dan ledger
- `/seller/withdrawals` — daftar penarikan
- `/seller/withdrawals/new` — pengajuan penarikan
- `/seller/withdrawals/[id]` — timeline penarikan

Setiap route memakai komponen storefront yang sudah ada, CSS token tema yang
sama, dan action terpisah dengan state loading/empty/error. Admin payment,
inventory, seller review, dan withdrawal tidak digabung dalam satu form besar.
