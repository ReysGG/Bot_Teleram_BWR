# Next Plan — Portal Seller, Produk Milik Seller, dan Penarikan Saldo

Tanggal rancangan: 20 September 2026  
Status: **rancangan untuk ditinjau; belum merupakan implementasi atau izin deployment**  
Workspace: Independent Telegram Store dan storefront di folder ini.

## 1. Tujuan dan keputusan utama

Seller dapat membuat serta mengelola produk miliknya sendiri, mengunggah stok produk tersebut, melihat penjualan dan pendapatannya, lalu mengajukan penarikan saldo. Admin mengendalikan penerimaan seller, publikasi produk, komisi, penyelesaian masalah, dan pembayaran penarikan.

Rancangan yang disarankan:

1. Portal seller berada di `https://store.buildwithreys.com/seller`.
2. Operasi admin tetap di `https://api.buildwithreys.com/admin`.
3. Login seller memakai Clerk production yang sama dengan storefront. Hak seller ditentukan backend dari membership yang dikelola admin.
4. Backend Telegram tetap menjadi pemilik database dan seluruh keputusan bisnis. Storefront hanya mengaksesnya melalui API terautentikasi.
5. Katalog, checkout, pembayaran, reservasi stok, refund pembeli, dan pengiriman tetap memakai layanan utama yang sudah ada.
6. Saldo seller menggunakan ledger terpisah dari wallet pembeli dan wallet Telegram.
7. Untuk versi pertama, pencairan dilakukan admin secara manual ke rekening yang sudah diverifikasi. Approve dan transfer selesai adalah dua langkah berbeda.
8. Fitur dibuka bertahap melalui flag dan daftar seller pilot. Produk serta order lama tetap mengikuti perilaku lama.

**Batas penting:** ini perluasan toko independen ini, bukan integrasi dengan BuildWithReys Market Project. Tidak ada sharing database, model Prisma, customer, atau API bisnis dengan project lain.

## 2. Kondisi sistem yang menjadi dasar rancangan

Bagian ini berasal dari kode dan dokumentasi workspace, bukan audit database produksi pada saat penulisan.

| Komponen yang sudah ada | Implikasi untuk seller |
| --- | --- |
| Backend Next.js dengan Prisma/PostgreSQL | Entitas seller dan ledger berada di backend ini |
| Storefront Next.js terpisah | Tidak boleh mengimpor Prisma backend atau menerima secret pembayaran |
| Clerk production dan verifikasi issuer, signature, `azp`, session, expiry | Autentikasi seller memperluas mekanisme ini, bukan membuat login baru |
| `Product`, `ProductGroup`, `DigitalStockItem` | Kepemilikan seller perlu ditambahkan tanpa mengganti identitas produk lama |
| `Order`, `OrderItem`, `Payment` | Identitas seller dan pembagian pendapatan perlu disnapshot saat order dibuat |
| `confirmOrderPayment` | Tetap satu transaksi utama konfirmasi otomatis maupun manual |
| `adminOrderPaymentRecoveryAction`, `AdminOrderPaymentAction` | Hak seller tidak boleh menjangkau tindakan approval ini |
| `queueOrderDigitalDelivery`, `SentDelivery`, notification worker | Produk seller dikirim lewat pipeline yang sama; tidak membuat pengiriman kedua |
| Wallet Telegram dan customer website | Tidak dijadikan saldo usaha seller |
| Cache katalog publik 60 detik | Data seller publik boleh mengikuti cache; saldo dan data privat tidak |
| Info `soldCount` dari unit order dibayar tanpa refund | Laporan seller perlu membedakan unit terjual, pendapatan tertahan, dan saldo tersedia |

### 2.1 Batas checkout yang harus dipertahankan pada versi pertama

Walaupun tabel `OrderItem` dapat berisi banyak baris dan keranjang menyimpan beberapa produk, jalur pembuatan dan konfirmasi order sekarang mengandalkan produk pertama untuk locking/alokasi. Pembuatan order digital juga membuat satu baris item per unit, dengan `quantity = 1`.

**Keputusan V1: satu order tetap untuk satu produk/varian dan satu pemilik seller.**

- Banyak unit produk yang sama tetap didukung.
- Jangan memperkenalkan satu invoice untuk campuran produk beberapa seller dalam rilis ini.
- Keranjang boleh mempertahankan perilaku checkout saat ini; produk seller tidak menjadi alasan mengganti mekanisme keranjang.
- Jangan menyimpulkan sistem sudah mendukung multi-seller checkout hanya karena ada array `items`.
- Fitur multi-seller dalam satu invoice membutuhkan rancangan tersendiri untuk pembagian nominal, refund parsial, alokasi, dan pengiriman.

### 2.2 Perbedaan fulfillment website dan Telegram

- Telegram mengunggah dokumen dan mencatat receipt pengiriman. Receipt `SENT` berarti API Telegram menerima dokumen, bukan jaminan pembeli sudah membacanya.
- Website menyiapkan receipt `READY`, sedangkan status selesai yang ada dapat bergantung pada pengambilan file.
- Karena itu, saldo seller tidak boleh dilepas hanya berdasarkan satu pemeriksaan `order.status === COMPLETED` untuk semua channel. Kelayakan settlement harus didefinisikan khusus dan dipetakan ke bukti yang benar pada bagian 10.

## 3. Ruang lingkup versi pertama

### Termasuk

- Admin mengundang/mengaktifkan seller; belum ada pendaftaran seller publik otomatis.
- Satu akun Clerk menjadi pemilik satu seller pada V1.
- Seller tetap dapat belanja sebagai customer dengan akun yang sama.
- Produk baru seller masuk draft, lalu review admin sebelum tayang.
- Edit produk yang sudah tayang diajukan sebagai revisi; versi lama tetap terjaga.
- Upload dan pemeriksaan stok milik seller menggunakan validasi/enkripsi yang sama.
- Dashboard, penjualan, saldo, ledger, dan riwayat penarikan milik seller sendiri.
- Komisi platform dengan snapshot per transaksi.
- Pendapatan tertahan, saldo tersedia, penahanan withdrawal, dan penyesuaian akibat refund.
- Permintaan penarikan, review admin, pencatatan transfer, dan audit.
- Seller suspension yang menghentikan penjualan baru tanpa menghilangkan order lama.

### Ditunda

- Satu invoice untuk banyak seller.
- Seller membuat bot/payment gateway sendiri atau mengganti rekening penerima pembayaran pembeli.
- Seller melakukan approval pembayaran pembeli, refund, edit saldo, atau kirim ulang kredensial.
- Transfer bank otomatis melalui API payout, payout kripto, dan konversi saldo seller antar-mata-uang.
- Tim seller dengan banyak staff, role custom, atau organisasi Clerk berlapis.
- Seller menerbitkan voucher sendiri, mengatur komisi sendiri, dan melakukan broadcast global.
- Memindahkan produk dan penjualan lama ke seller secara otomatis.
- Seller mengakses seluruh data customer, pencarian isi stok global, atau file seller lain.

## 4. Role, identitas, dan pembatasan akses

### 4.1 Tiga peran yang terpisah

| Kemampuan | Customer | Seller aktif | Admin |
| --- | --- | --- | --- |
| Melihat katalog dan membeli | Ya | Ya, sebagai customer | Sesuai alur customer |
| Membuat draft produk seller | Tidak | Produk miliknya | Semua seller |
| Mengedit draft/revisi | Tidak | Miliknya | Semua |
| Menyetujui publikasi | Tidak | Tidak pada V1 | Ya |
| Menambah stok | Tidak | Produk miliknya yang diizinkan | Semua |
| Melihat penjualan | Pesanan belinya sendiri | Baris penjualan miliknya | Semua |
| Melihat email/telepon pembeli lengkap | Akunnya sendiri | Tidak secara default | Sesuai kebutuhan admin |
| Mengonfirmasi pembayaran pembeli | Tidak | Tidak | Melalui policy utama |
| Mengubah harga pada invoice lama | Tidak | Tidak | Tetap tidak boleh |
| Mengubah stok reserved/delivered | Tidak | Tidak | Hanya recovery yang sudah diatur |
| Melihat wallet seller | Tidak | Miliknya | Semua |
| Mengajukan penarikan | Tidak | Dari saldo tersedia miliknya | Dapat membantu melalui tindakan teraudit |
| Approve/reject/mark-paid penarikan | Tidak | Tidak | Ya |
| Menyetel gateway, kurs, komisi, maintenance | Tidak | Tidak | Ya |

Seller tidak memakai endpoint `/api/admin/*`. Menyembunyikan menu admin tidak cukup: akses tetap ditolak di backend untuk setiap request.

### 4.2 Sumber hak akses

Usulan model identitas:

```text
Token Clerk terverifikasi
    -> (issuer, subject/userId)
    -> SellerMembership aktif di backend
    -> SellerAccount aktif
    -> policy tindakan + ownership objek
```

- Membership lokal menjadi sumber kebenaran izin seller.
- Metadata publik Clerk atau nilai role dari browser hanya boleh membantu tampilan, bukan memberikan hak akses.
- Jangan mengangkat seller menjadi admin Clerk atau admin aplikasi secara otomatis.
- Jangan menerima `sellerId`, `ownerId`, `role`, atau `commissionBps` dari form lalu mempercayainya.
- Identitas customer dan seller dipisahkan. Seller tidak wajib membuat akun belanja/`WebCustomer` dahulu untuk mengelola produk.
- Email digunakan untuk undangan, bukan kunci ownership permanen. Binding akhir memakai issuer dan user ID Clerk yang terverifikasi.

### 4.3 Pengalaman login yang konsisten

- Gunakan login/register yang sudah ada dan redirect kembali ke `/seller` atau route tujuan yang tervalidasi.
- Setelah login customer biasa, jangan otomatis memberikan role seller.
- Jika belum menjadi seller, `/seller` menunjukkan penjelasan dan cara menghubungi admin atau menerima undangan yang valid.
- Setelah seller suspended, sesi Clerk boleh tetap aktif untuk membeli, tetapi akses pengelolaan seller ditolak atau dibatasi menjadi read-only sesuai status.
- Pertahankan `commerceAccessToken()` yang meneruskan token sesi asli dengan `getToken()` tanpa mint token BAPI baru yang kehilangan `azp`.
- Jika UI memakai Bearer browser, verifikasi signature/issuer/origin/session tetap dilakukan backend. Jangan meletakkan JWT di URL atau storage aplikasi.

## 5. Peta route website

Semua route di tabel ini adalah **usulan route baru** kecuali route login/register yang sudah ada.

### 5.1 Portal seller — domain storefront

| Route | Isi dan fungsi |
| --- | --- |
| `/seller` | Dashboard ringkas: penjualan, saldo, stok menipis, status review, withdrawal |
| `/seller/onboarding` | Lengkapi nama toko, kontak internal, penerimaan undangan |
| `/seller/products` | Daftar produk sendiri, search, status, tautan edit dan stok |
| `/seller/products/new` | Membuat draft produk sendiri |
| `/seller/products/drafts/[draftId]` | Draft baru/revisi, alasan penolakan, submit review |
| `/seller/products/[productId]` | Ringkasan produk live dan status revisi |
| `/seller/products/[productId]/edit` | Membuat/melanjutkan revisi, bukan menimpa invoice atau versi live sembarangan |
| `/seller/products/[productId]/stock` | Ringkasan stok sendiri, batch dan status health |
| `/seller/products/[productId]/stock/upload` | Upload dengan progress, hasil validasi dan batas batch |
| `/seller/products/[productId]/stock/batches/[batchId]` | Hasil upload: diterima, duplikat, invalid, karantina |
| `/seller/sales` | Riwayat penjualan sendiri dengan pagination/filter tanggal/status/channel |
| `/seller/sales/[saleId]` | Detail penjualan seller, nominal bersih, status fulfillment/settlement |
| `/seller/balance` | Saldo tertahan/tersedia/penarikan dan ledger terpaginasikan |
| `/seller/withdrawals` | Riwayat permintaan pencairan |
| `/seller/withdrawals/new` | Nominal, rekening terverifikasi, biaya, konfirmasi |
| `/seller/withdrawals/[withdrawalId]` | Timeline review, transfer, alasan penolakan atau pemeriksaan |
| `/seller/payout-accounts` | Rekening seller dan status verifikasi |
| `/seller/payout-accounts/new` | Mengajukan rekening baru |
| `/seller/settings` | Profil toko dan preferensi yang boleh diubah seller |

Keputusan UI:

- Gunakan layout `/seller/layout.tsx` sendiri; jangan memasukkan form seller ke dashboard admin.
- Desktop memakai sidebar ringkas. Mobile memakai menu seller yang mudah dibuka, tabel berubah menjadi kartu jika perlu.
- Daftar adalah daftar; edit kompleks tetap di halaman khusus.
- Halaman seller memiliki loading/skeleton, empty state, error yang jelas, dan tombol retry.
- Penarikan dan submit review menampilkan preview sebelum konfirmasi.
- Tambahkan tautan "Dashboard seller" pada profil hanya setelah status seller diketahui. Pembeli biasa tidak dibebani menu tersebut.
- Redirect login mempertahankan tujuan aman. Data draft sensitif dan isi stok tidak disimpan di `localStorage`.

### 5.2 Admin — domain backend

| Route | Isi dan fungsi |
| --- | --- |
| `/admin/sellers` | Daftar seller, status, search, saldo ringkas |
| `/admin/sellers/new` | Undang/daftarkan seller dari admin |
| `/admin/sellers/[sellerId]` | Ringkasan seller, membership, produk dan risiko operasional |
| `/admin/sellers/[sellerId]/edit` | Nama toko, status dan ketentuan seller |
| `/admin/sellers/[sellerId]/commission` | Komisi untuk order berikutnya; riwayat perubahan |
| `/admin/sellers/[sellerId]/balance` | Ledger dan penyesuaian dengan alasan wajib |
| `/admin/seller-products/reviews` | Antrean publikasi/revisi produk |
| `/admin/seller-products/reviews/[revisionId]` | Perbandingan sebelum/sesudah, approve/reject |
| `/admin/seller-payout-accounts` | Antrean verifikasi rekening |
| `/admin/seller-payout-accounts/[accountId]` | Review rekening dan histori perubahan |
| `/admin/seller-withdrawals` | Antrean penarikan, filter status, umur antrean |
| `/admin/seller-withdrawals/[withdrawalId]` | Detail, approve/reject, mulai transfer, bukti, mark-paid |
| `/admin/seller-disputes` | Masalah produk/pengiriman yang menahan settlement |
| `/admin/seller-disputes/[disputeId]` | Keputusan settlement/refund/recovery oleh admin |

Tindakan pembayaran pembeli tetap di route `/admin/payments/*` yang sudah ada. Seller withdrawal adalah operasi lain dan tidak boleh memakai tombol konfirmasi invoice pembeli.

### 5.3 Halaman publik

- Katalog tetap `/shop`, `/categories/*`, dan `/products/[slug]`.
- Produk yang sudah disetujui boleh menampilkan "Dijual oleh [nama toko]".
- Profil publik `/stores/[sellerSlug]` bersifat opsional setelah V1 stabil; tidak diperlukan untuk memulai seller.
- Jangan tampilkan saldo seller, identitas rekening, email internal, komisi privat, atau pendapatan toko lain pada response katalog.

## 6. Kontrak API dan boundary

### 6.1 Jalur request seller

```text
Browser seller
  -> storefront /api/seller/*
  -> HTTPS + HMAC storefront + token Clerk seller
  -> backend /api/storefront/v1/seller/*
  -> requireSellerIdentity + permission + ownership
  -> service domain dan database backend
```

HMAC membuktikan pemanggil service adalah storefront, **bukan** bahwa user memiliki role seller. Token user dan membership seller tetap harus diperiksa.

### 6.2 Endpoint seller yang disarankan

Path publik BFF `/api/seller/...` dipetakan ke backend `/api/storefront/v1/seller/...` dengan suffix yang sama.

| Method dan suffix | Fungsi |
| --- | --- |
| `GET /me` | Status seller, izin terbatas, profil toko |
| `GET /dashboard` | Ringkasan terikat seller sendiri |
| `GET /products` | Produk milik seller, cursor/pagination |
| `POST /products/drafts` | Membuat draft milik identitas pemanggil |
| `GET /products/drafts/[draftId]` | Membaca draft sendiri |
| `PATCH /products/drafts/[draftId]` | Menyimpan field yang diizinkan, memakai version |
| `POST /products/drafts/[draftId]/submit` | Submit review idempotent |
| `GET /products/[productId]` | Detail produk sendiri |
| `POST /products/[productId]/revisions` | Membuat revisi produk sendiri |
| `POST /products/[productId]/pause` | Menghentikan penjualan baru produk sendiri |
| `GET /products/[productId]/stock` | Metadata stok sendiri, bukan isi seluruh kredensial |
| `POST /products/[productId]/stock/imports` | Impor stok melalui service validasi/enkripsi yang sama |
| `GET /products/[productId]/stock/imports/[batchId]` | Progress dan hasil batch sendiri |
| `POST /products/[productId]/stock/[stockId]/archive` | Hanya stok available yang boleh diarsip sesuai policy |
| `GET /sales` dan `GET /sales/[saleId]` | DTO penjualan milik seller |
| `GET /balance` dan `GET /balance/entries` | Saldo serta ledger sendiri |
| `GET /withdrawals` dan `GET /withdrawals/[id]` | Penarikan sendiri |
| `POST /withdrawals` | Membuat request sekaligus menahan saldo secara atomik |
| `POST /withdrawals/[id]/cancel` | Seller membatalkan hanya request yang masih REQUESTED |
| `GET /payout-accounts` dan `POST /payout-accounts` | Rekening sendiri; nomor penuh tidak dikembalikan pada list |

Tidak ada endpoint seller untuk `confirm-payment`, `mark-paid`, `edit-balance`, `set-commission`, atau `resend-file`.

### 6.3 Endpoint admin yang disarankan

Semua memakai autentikasi admin saat ini, same-origin protection, validasi payload, serta audit actor.

| Endpoint | Fungsi |
| --- | --- |
| `POST /api/admin/sellers` | Undang/buat seller |
| `POST /api/admin/sellers/[id]/activate` | Aktivasi setelah review |
| `POST /api/admin/sellers/[id]/suspend` | Suspend dengan alasan dan kebijakan transaksi lama |
| `POST /api/admin/sellers/[id]/commission` | Ubah komisi untuk order baru |
| `POST /api/admin/seller-products/reviews/[id]/approve` | Publikasi atomik revisi terpilih |
| `POST /api/admin/seller-products/reviews/[id]/reject` | Tolak dengan alasan |
| `POST /api/admin/seller-payout-accounts/[id]/approve` | Verifikasi rekening |
| `POST /api/admin/seller-payout-accounts/[id]/reject` | Tolak rekening |
| `POST /api/admin/seller-withdrawals/[id]/approve` | Menyetujui pencairan, belum menandai transfer berhasil |
| `POST /api/admin/seller-withdrawals/[id]/reject` | Menolak request yang masih bisa dibatalkan |
| `POST /api/admin/seller-withdrawals/[id]/start-payment` | Mengunci request untuk proses transfer |
| `POST /api/admin/seller-withdrawals/[id]/mark-paid` | Mencatat transfer berhasil beserta referensi/bukti |
| `POST /api/admin/seller-withdrawals/[id]/mark-failed` | Gagal pasti sebelum/selama transfer, dengan bukti |
| `POST /api/admin/seller-withdrawals/[id]/resolve` | Menyelesaikan hasil transfer ambigu melalui review |
| `POST /api/admin/seller-balance-adjustments` | Koreksi ledger dengan referensi dan alasan wajib |
| `POST /api/admin/seller-disputes/[id]/resolve` | Menentukan pelepasan saldo atau jalur refund utama |

POST admin redirect kembali ke halaman asal yang tervalidasi dengan kode hasil stabil. API seller mengembalikan JSON dan tidak mengirim stack trace, token, SQL, atau data pihak lain.

### 6.4 Bentuk request/response

Contoh permintaan penarikan:

```json
{
  "amountIdr": "100000",
  "payoutAccountId": "account_owned_by_current_seller",
  "idempotencyKey": "client_generated_uuid"
}
```

`sellerId`, fee, status, dan saldo setelah request **tidak** diterima dari client. Semuanya diturunkan backend.

Contoh hasil:

```json
{
  "ok": true,
  "withdrawal": {
    "id": "withdrawal_id",
    "status": "REQUESTED",
    "amountIdr": "100000",
    "feeIdr": "0",
    "netPayoutIdr": "100000"
  }
}
```

Angka di atas hanya contoh kontrak, bukan pengaturan biaya yang diputuskan.

Error minimum:

| Status | Kode | Makna |
| --- | --- | --- |
| 401 | `sign_in_required` | Sesi tidak sah |
| 403 | `seller_access_required` | Tidak memiliki akses seller |
| 403 | `seller_suspended` | Akses atau tindakan seller sedang ditahan |
| 404 | `resource_not_found` | Objek tidak ada atau bukan milik seller; jangan bocorkan keberadaannya |
| 409 | `version_conflict` | Draft berubah di tab lain |
| 409 | `insufficient_available_balance` | Saldo tersedia tidak cukup |
| 409 | `withdrawal_state_changed` | Request sudah diproses pihak lain |
| 409 | `idempotency_conflict` | Key sama dipakai untuk payload berbeda |
| 409 | `payout_account_not_ready` | Rekening belum diverifikasi/masa tunggu belum selesai |
| 422 | `validation_failed` | Input tidak memenuhi aturan |
| 429 | `rate_limited` | Batas request terlampaui |
| 503 | `seller_feature_unavailable` | Flag/tahap fitur belum aktif |

## 7. Model data tambahan

Nama berikut adalah **usulan**, bukan schema yang sudah diterapkan. Final Prisma/SQL harus dibuat dan diuji dalam tahap implementasi.

### 7.1 Entitas inti

| Entitas | Field/kegunaan utama |
| --- | --- |
| `SellerAccount` | id, slug unik, displayName, status, salesPaused, withdrawalPaused, commissionBps, policyVersion, timestamps |
| `SellerMembership` | sellerId, clerkIssuer, clerkUserId, role OWNER, status; unique identitas untuk V1 |
| `SellerInvitation` | sellerId, hash token undangan, intended email hash, expiry, acceptedAt; token sekali pakai |
| `SellerProductDraft` | sellerId, targetProductId nullable, revision, payload terstruktur, status review, reviewer, reason, timestamps |
| `SellerProductPublication` | productId unik, sellerId, approvedRevisionId, publikasi/pause metadata |
| `SellerStockImport` | sellerId, productId, upload fingerprint, counts, status, idempotency key, result aman |
| `SellerSale` | sellerId, orderId, orderItemId unik, snapshot unit, gross, fee, net, settlement state |
| `SellerWallet` | sellerId unik, currency IDR, projection pending/available/withdrawalHeld/debt, revision |
| `SellerLedgerTransaction` | jenis operasi, source/idempotency key unik, sellerId, order/withdrawal reference, actor, reason |
| `SellerLedgerEntry` | transactionId, account/bucket, debit/credit dalam Rupiah integer; append-only |
| `SellerWithdrawal` | sellerId, nominal/fee/net, rekening snapshot, state, version, requested/approved/paid timestamps |
| `SellerPayoutAttempt` | withdrawalId, attemptNo, status, provider/manual reference, evidence pointer, operator, waktu |
| `SellerPayoutAccount` | sellerId, bank/e-wallet type yang didukung, nomor terenkripsi, masked value, verification status, version |
| `SellerDispute` | sellerId, order/item reference, kategori, status, hold amount, keputusan admin |
| `SellerDomainEvent` | event unik, order/item reference, version, status, lease, retries; outbox lokal |
| `SellerAuditLog` | actor, action, target, outcome, safe before/after, requestId, timestamp |

### 7.2 Perubahan additive pada model yang sudah ada

**Product**

- Tambah `sellerId` nullable dengan FK restrict.
- `sellerId = null` berarti produk milik platform/admin seperti sekarang.
- Produk seller baru diterbitkan dari draft yang disetujui.
- Ownership produk tidak dapat diubah seller dan tidak dapat dipindah diam-diam oleh admin.
- Perpindahan ownership produk live sebaiknya dilarang pada V1. Jika dibutuhkan, buat prosedur terpisah untuk order/stock aktif dan histori.

**OrderItem**

Tambahkan snapshot nullable untuk order baru seller:

- `sellerIdSnapshot`;
- `sellerDisplayNameSnapshot`;
- `sellerPolicyVersionSnapshot`;
- `sellerCommissionBpsSnapshot`;
- `sellerGrossIdrSnapshot`;
- `sellerCommissionIdrSnapshot`;
- `sellerNetIdrSnapshot`.

Seller dan komisi diambil dari produk/policy terverifikasi saat checkout, bukan dari payload buyer. Produk/komisi yang berubah kemudian tidak boleh mengubah hak pendapatan order lama.

**DigitalStockItem**

- `productId` tetap menjadi FK utama stok.
- Ownership operasional diturunkan melalui product; jangan menyimpan field seller tambahan yang dapat berbeda tanpa constraint.
- Metadata pemasok/batch dapat memakai relation ke `SellerStockImport`.
- Stok reserved/delivered tetap tidak bisa diedit, dipindah produk, atau dihapus seller.

**Model lama lainnya**

- `Payment`, gateway attempts, `SentDelivery`, wallet pembeli, dan notification outbox tidak diganti.
- Field seller baru pada order lama tetap null. Jangan membuat seller earning retroaktif hanya karena product kemudian diberi owner.
- Jangan membuat cascade-delete dari seller ke produk, transaksi, stok, atau ledger.

### 7.3 Constraint dan index penting

- Membership: unique `(clerkIssuer, clerkUserId)` pada V1; ubah hanya ketika multi-store membership dirancang.
- Draft: index `(sellerId, status, updatedAt)`; optimistic version untuk edit.
- Product: index `(sellerId, status, createdAt)`.
- Sale: unique `orderItemId`; index `(sellerId, createdAt, id)` dan `(sellerId, settlementStatus, eligibleAt)`.
- Withdrawal: index `(sellerId, createdAt, id)` dan `(status, createdAt)`; unique `(sellerId, idempotencyKey)`.
- Payout attempt: unique `(withdrawalId, attemptNo)`; referensi transfer harus unik dalam scope provider/rekening sumber, bukan label bebas semata.
- Ledger transaction: unique source key untuk paid, release, refund, withdrawal reserve/release/pay.
- Ledger entries tidak diubah/dihapus melalui API aplikasi; koreksi memakai transaksi kompensasi baru.
- Nilai pending/available/held tidak boleh negatif. Debt positif dimodelkan tersendiri, bukan saldo UI yang dibiarkan minus tanpa aturan.
- Nilai baru yang dapat terakumulasi besar disimpan sebagai BigInt Rupiah; API serialisasi decimal string. Jangan memakai floating point untuk uang atau konversi saldo.

## 8. Siklus hidup seller dan produk

### 8.1 Seller

```text
INVITED -> PENDING_REVIEW -> ACTIVE
ACTIVE -> SUSPENDED -> ACTIVE
ACTIVE/SUSPENDED -> CLOSED (setelah kewajiban diselesaikan)
```

- Admin menentukan aktivasi dan suspension.
- `CLOSED` bukan penghapusan history.
- Bedakan pause penjualan dan pause penarikan; seller yang berhenti menjual mungkin masih punya saldo yang wajib dibayar.
- Jika seller suspended, worker tetap dapat menyelesaikan order yang sudah dibayar dari snapshot yang sah. Jika stoknya bermasalah, gunakan dispute/refund yang eksplisit.
- Invoice sebelum suspension yang kemudian dibayar tidak boleh diabaikan. Penyelesaian harus mengikuti status snapshot, bukti pembayaran dan kebijakan fulfillment yang sudah ada.

### 8.2 Produk baru

```text
Seller membuat draft
  -> validasi field dan kepemilikan
  -> SUBMITTED
  -> admin review
  -> APPROVED: publish ke Product utama
  -> atau REJECTED: alasan ditampilkan, seller memperbaiki draft
```

Rekomendasi V1: draft disimpan di staging terpisah. Produk draft tidak masuk katalog, pencarian publik, carousel, broadcast, atau checkout.

Saat publish, backend memanggil service produk yang dipakai admin dengan policy seller tambahan. Jangan memanggil route admin dari route seller, dan jangan menyalin seluruh fungsi create/edit admin.

### 8.3 Revisi produk live

- Perubahan harga, deskripsi, image, panduan, redeem URL, atau pengaturan preorder disimpan sebagai revision.
- Versi approved sebelumnya tetap live sampai revisi baru disetujui.
- Admin melihat diff yang aman sebelum approve.
- Dua admin meng-approve revision yang sama menghasilkan satu publikasi, satu invalidasi cache, dan paling banyak satu broadcast yang memang diizinkan.
- Seller tidak boleh mengaktifkan penjualan stok banned atau mengubah whitelist/redeem provider.
- Global kategori `ProductGroup` tetap dikelola admin. Seller memilih kategori yang diizinkan, bukan mengedit grup milik semua produk.

### 8.4 Pause produk

- Seller boleh pause produk sendiri untuk menghentikan checkout baru.
- Resume produk yang masih approved dapat melalui policy sederhana; produk yang direject/suspended tidak dapat dihidupkan sendiri.
- Cache katalog dapat tertinggal singkat, tetapi checkout selalu memeriksa kondisi terbaru.
- Paid order dan stok yang sudah reserved tidak dilepas hanya karena produk dipause.

### 8.5 Upload stok

- Backend memeriksa seller, produk, batas ukuran/jumlah, format, fingerprint duplikat, dan akses sebelum dekripsi/penyimpanan.
- Reuse enkripsi inventory, pemeriksaan health, deteksi file, dan dedupe yang sudah ada.
- Batch baru dapat masuk karantina sampai validasi selesai; seller tidak dapat memaksa status HEALTHY.
- Untuk V1 batasi ukuran batch dan jumlah pekerjaan paralel; jangan memasang parser file berat di request yang tidak terbatas.
- Seller melihat metadata stok sendiri, nama file yang aman, dan hasil validasi. Export isi stok yang sudah terjual tidak disediakan.
- Upload seller tidak boleh mengirim pengumuman global otomatis setiap retry.

## 9. Definisi pendapatan dan komisi

### 9.1 Apa yang menjadi hak seller

Basis yang disarankan adalah nilai produk setelah diskon yang dibebankan seller, tidak termasuk fee gateway/platform dan kode unik pembayaran.

```text
sellerGross = nilai unit produk setelah alokasi diskon seller
commission = floor(sellerGross * commissionBps / 10_000)
sellerNet  = sellerGross - commission
```

- Hitung integer per unit/snapshot item secara deterministik, lalu jumlahkan. Jangan membulatkan berbeda di dashboard dan payout.
- Snapshot harus selalu memenuhi `sellerGross = commission + sellerNet`.
- Jika suatu promosi didanai platform, jangan diam-diam membebankan diskon itu ke seller. Skema promo tersebut harus memiliki field alokasi yang eksplisit sebelum diaktifkan.
- V1 dapat memakai komisi sederhana tanpa voucher seller atau aturan diskon baru.

### 9.2 Contoh ilustratif

Contoh ini bukan angka komisi yang sudah diputuskan:

| Komponen | Nilai |
| --- | ---: |
| Dua unit × Rp50.000 | Rp100.000 |
| Komisi contoh 10% | Rp10.000 |
| Hak bersih seller | Rp90.000 |
| Fee/kode unik tambahan pembeli | Milik alokasi platform, tidak menambah sellerNet |

Kurs Binance/USDT tetap milik sistem pembayaran utama. Untuk V1, hak seller dinyatakan dalam **IDR dari snapshot harga produk**, walaupun pembeli membayar USDT. Jangan mengonversinya lagi memakai kurs terkini saat seller membuka dashboard.

Platform perlu melihat kecukupan dana nyata terhadap kewajiban payout IDR. Ledger hak seller bukan bukti bahwa rekening operasional mempunyai saldo tunai yang cukup. Risiko konversi/fee pembayaran perlu dipertimbangkan dalam keputusan bisnis, bukan disembunyikan dengan mengubah snapshot.

### 9.3 Order platform lama

- Order tanpa seller snapshot tidak menghasilkan SellerSale atau seller earning.
- Produk admin tetap masuk katalog dan total terjual seperti sekarang.
- Data historis tidak dibagi atau diberikan kepada seller baru secara otomatis.

## 10. Saldo seller dan settlement

### 10.1 Empat angka yang dilihat seller

| Angka | Arti |
| --- | --- |
| Pendapatan tertahan | Hak penjualan yang belum memenuhi syarat pencairan |
| Saldo tersedia | Dapat diajukan untuk penarikan sekarang |
| Dalam penarikan | Sudah dicadangkan untuk request pencairan |
| Penyesuaian/kewajiban | Nilai yang perlu dipulihkan akibat refund atau koreksi setelah pencairan |

Total penjualan bukan saldo tersedia. Tampilan harus menjelaskan mengapa suatu penjualan masih tertahan dan tanggal eligible jika diketahui.

### 10.2 Kapan earning dibuat

- Snapshot hak seller dibuat saat checkout untuk mengunci policy.
- Earning PENDING baru diakui setelah `confirmOrderPayment` berhasil mencatat PAID.
- Pembayaran manual admin menghasilkan sumber audit manual, tetapi tidak boleh membuat pendapatan dua kali jika worker otomatis juga melihat transaksi yang sama.
- Wallet-only checkout perlu dicakup karena dapat menyelesaikan pembayaran di jalur pembuatan order, bukan lewat callback gateway biasa.
- Order yang langsung direfund karena stok tidak tersedia tidak boleh menghasilkan saldo tersedia. Event PAID/refund harus diproses sesuai versi/status akhir.

### 10.3 Kelayakan pelepasan saldo

Rekomendasi V1:

1. Pembayaran sah dan order tidak direfund/dibatalkan.
2. Unit telah dipenuhi berdasarkan channel:
   - **Telegram:** receipt SENT dengan message ID, stok dan owner konsisten, tidak UNKNOWN/SENDING/FAILED.
   - **Web:** hak unduh sudah READY atau SENT untuk stok yang sah dan teralokasi ke order tersebut. Tidak wajib menunggu buyer menekan Download tanpa batas.
3. Masa penahanan seller telah berlalu dari waktu unit eligible tersebut.
4. Tidak ada dispute atau hold admin.
5. Tidak ada debt yang harus ditutup terlebih dahulu.

Durasi hold harus disetujui owner sebelum implementasi aktif; **48 jam dapat dipakai sebagai contoh awal untuk pilot**, bukan pengaturan yang dipasang oleh dokumen ini. Durasi dapat berbeda menurut jenis produk, tetapi V1 sebaiknya satu aturan yang jelas dahulu.

Keputusan memakai READY pada Web adalah policy settlement seller yang baru, tidak mengubah semantik order COMPLETED atau event pengumuman pembelian yang sudah ada.

### 10.4 Ledger, bukan update saldo langsung

- Setiap perubahan uang menghasilkan journal append-only yang seimbang: total debit = total kredit.
- `SellerWallet` hanya projection/cache yang diperbarui dalam transaksi yang sama dan dapat direkonstruksi dari ledger.
- Perpindahan pending → available dan available → withdrawal-held bukan pendapatan baru.
- Payout membutuhkan akun lawan/control clearing yang eksplisit. Tidak boleh dianggap sama dengan kredit wallet pembeli.
- Gunakan service bersama, misalnya `applySellerLedgerTransaction(tx, command)`, bukan `wallet.balance += amount` tersebar.
- Koreksi admin membuat entry kompensasi dengan sumber, actor, alasan dan idempotency key. Entry lama tidak diedit.
- Kewajiban seller dicatat sebagai debt terpisah dan tidak mengubah saldo pembeli dengan shortcut.

Contoh key:

```text
seller-earning:order-item:<itemId>
seller-release:order-item:<itemId>
seller-refund:<refundEventId>:<itemId>
seller-withdrawal-reserve:<withdrawalId>
seller-withdrawal-release:<withdrawalId>
seller-withdrawal-paid:<withdrawalId>
seller-adjustment:<adjustmentId>
```

### 10.5 Refund dan dispute

| Kondisi | Dampak pada seller |
| --- | --- |
| Order belum dibayar | Tidak ada earning |
| Refund saat earning masih pending | Balikkan pending dengan entry kompensasi |
| Refund setelah earning available | Kurangi available sesuai hak unit yang dibatalkan |
| Dana masih dalam request penarikan yang belum diproses | Tahan/cancel request sesuai policy admin sebelum mengembalikan held; seluruh operasi memakai lock yang sama |
| Transfer sedang PROCESSING atau hasilnya tidak pasti | Jangan menganggap dana belum terkirim; tahan request dan buat kewajiban/hold yang dapat direkonsiliasi |
| Dana sudah dibayarkan dan available tidak cukup | Buat seller debt; blokir withdrawal baru, offset dari pendapatan berikutnya secara teraudit |

Contoh: sellerNet Rp90.000, sudah dicairkan Rp60.000, tersedia Rp30.000. Refund satu unit dengan sellerNet Rp45.000 menghasilkan available Rp0 dan debt Rp15.000, bukan available negatif yang diabaikan.

Refund pembeli tetap memakai business policy/service refund yang berlaku. Modul seller hanya mencatat dampak akuntansinya. Rancangan ini tidak otomatis menambahkan hak refund setelah order COMPLETED jika policy sekarang melarangnya; kasus tersebut masuk keputusan dispute/recovery admin terlebih dahulu.

## 11. Alur penarikan saldo secara lengkap

### 11.1 Rekening pencairan

- V1 disarankan transfer bank IDR manual. Dukungan e-wallet dapat ditambahkan sebagai pilihan eksplisit setelah validasi.
- Seller mengajukan rekening; admin memverifikasi nama penerima dan kesesuaian data sesuai kebijakan operasional.
- Nomor rekening tersimpan terenkripsi, list hanya masked.
- Perubahan rekening membuat versi/rekening baru yang perlu diverifikasi ulang. Withdrawal lama tetap memakai snapshot sebelumnya.
- Terapkan masa tunggu perubahan rekening yang disetujui owner, misalnya contoh 24 jam. Jangan menggunakan nilai contoh tanpa keputusan akhir.
- Bukti transfer disimpan privat dengan autentikasi, batas ukuran, dan aturan retensi; tidak memakai folder `public`.

### 11.2 State withdrawal

```text
REQUESTED -> APPROVED -> PROCESSING -> PAID
    |           |             |
    |           |             +-> MANUAL_REVIEW
    |           +-> REJECTED   |      -> PAID / FAILED_FINAL
    +-> REJECTED              +-> FAILED_FINAL (hanya gagal pasti)
    +-> CANCELLED
```

| State | Saldo dan tindakan |
| --- | --- |
| REQUESTED | Available sudah dipindahkan ke held; menunggu admin |
| APPROVED | Admin menyetujui; dana tetap held |
| PROCESSING | Satu operator/attempt memegang proses transfer; tidak dapat dibatalkan seller |
| PAID | Transfer terbukti berhasil; held diselesaikan sekali |
| REJECTED/CANCELLED | Dana dikembalikan ke available sekali, jika belum masuk proses transfer |
| MANUAL_REVIEW | Hasil transfer ambigu; dana tetap held dan retry otomatis dilarang |
| FAILED_FINAL | Ada bukti transfer gagal/tidak terjadi; held dilepas satu kali dengan audit |

**Approve bukan PAID.** Tanpa integrasi payout, menekan Approve tidak mengirim uang ke bank seller. UI admin harus menuliskan ini dengan jelas.

### 11.3 Membuat request

Dalam satu transaksi database:

1. Verifikasi seller aktif dan withdrawal tidak dipause.
2. Validasi rekening terverifikasi, currency, nominal, fee dan batas.
3. Kunci wallet seller.
4. Cari idempotency key; key yang sama dengan payload sama mengembalikan request yang sama.
5. Periksa debt/hold dan available >= nominal yang akan ditahan.
6. Buat SellerWithdrawal dengan snapshot rekening/biaya/policy.
7. Pindahkan available ke withdrawal-held di ledger.
8. Commit dan keluarkan receipt request.

Nominal yang dikurangi, biaya, dan nominal yang diterima harus jelas di layar. Rekomendasi: fee dikurangkan dari nominal request, sehingga `netPayout = requestedAmount - fee`, dengan minimum net > 0. Jika owner ingin fee ditanggung platform, itu policy lain yang harus disnapshot.

### 11.4 Admin approve

- Admin membaca request, saldo yang sudah ditahan, riwayat penjualan dan rekening snapshot.
- `REQUESTED -> APPROVED` menggunakan conditional update/version dan audit.
- Dua klik/dua admin tidak membuat dua request atau dua reservasi saldo.
- Setelah APPROVED, status seller menunjukkan "Disetujui, menunggu transfer".

### 11.5 Admin melakukan transfer

1. Admin memilih Mulai transfer; sistem membuat satu payout attempt aktif dan state PROCESSING.
2. UI menampilkan rekening snapshot, nama, jumlah net dan nomor withdrawal.
3. Admin melakukan transfer lewat aplikasi bank secara manual.
4. Admin memasukkan referensi transfer, waktu transfer, nominal aktual, dan bukti yang dibutuhkan.
5. Sistem memastikan referensi belum dipakai, nominal sesuai, state valid dan attempt masih milik request tersebut.
6. Mark-paid menyelesaikan held dan mencatat PAID dalam satu transaksi.
7. Notifikasi seller dikirim setelah commit melalui outbox, bukan sebelum transfer dipastikan.

Jika admin menutup halaman setelah melakukan transfer tetapi sebelum mark-paid, request tetap PROCESSING/MANUAL_REVIEW. Jangan melepaskan saldo atau mengirim ulang hanya karena timeout.

### 11.6 Idempotency transfer dan keterbatasan manual

- Sistem dapat mencegah dua operator memulai attempt yang sama serta dua pencatatan PAID.
- Sistem tidak bisa secara teknis mencegah manusia mengirim dua transfer di aplikasi bank terpisah. Karena itu claim operator, nomor request, bukti dan rekonsiliasi tetap diperlukan.
- Attempt PROCESSING yang terlalu lama masuk antrean review, bukan auto-retry.
- Jika API payout ditambahkan kelak, gunakan idempotency key provider dan query status sebelum retry. Jangan sekadar mengganti tombol manual menjadi panggilan API.

### 11.7 Contoh saldo

```text
Awal: available 90.000, held 0
Request 60.000: available 30.000, held 60.000
Admin approve: available 30.000, held 60.000
Transfer berhasil: available 30.000, held 0, paid withdrawal 60.000
```

Jika request ditolak sebelum transfer, available kembali Rp90.000 dan held Rp0. Retry penolakan tidak menambah saldo lagi.

## 12. Laporan penjualan seller

Seller boleh melihat:

- Produk/varian sendiri dan jumlah unit dibayar.
- Tanggal, channel Web/Telegram, invoice/reference yang relevan.
- Nilai produk, komisi snapshot, sellerNet, refund/penyesuaian.
- Status pembayaran ringkas, fulfillment, hold dan settlement.
- Total terjual, penjualan kotor, pendapatan bersih, pending, available dan withdrawal.

Seller tidak memperoleh:

- Isi kredensial yang sudah terjual, token login, cookie, payload gateway, receiver keys.
- Wallet pembeli, seluruh histori belanja buyer, IP, chat ID atau email lengkap secara default.
- Margin/cost produk platform dan penjualan seller lain.
- Kemampuan mencari global berdasarkan CDK atau isi inventory.

DTO seller disusun dengan field allowlist. Jangan mengambil seluruh order lalu hanya menyembunyikan kolom sensitif dengan CSS.

Filter maksimum: tanggal, productId milik seller, status, channel; pagination/cursor wajib. Ekspor CSV seller harus tetap scoped dan terhindar dari formula injection. Ekspor besar dijadikan job terbatasi, bukan satu request yang menahan RAM VPS.

## 13. Integrasi ke layanan yang sudah ada

| Titik integrasi | Tambahan minimum | Yang dipertahankan |
| --- | --- | --- |
| Create/edit produk | Draft review, ownership, shared validation/service | Identitas produk dan validasi media/panduan |
| `activePublicProductWhere` dan catalog policy | Seller approved/active untuk penjualan baru | Filter group aktif dan produk platform |
| `createDigitalOrder` | Snapshot seller/komisi dan seller-sale event untuk wallet-paid | Amount allocation, inventory lock, idempotency |
| `confirmOrderPayment` | Rekam event seller earning setelah status paid sah | Satu transaksi pembayaran untuk otomatis/manual |
| Preorder allocation | Event readiness setelah stok benar-benar teralokasi | FIFO dan alokasi stok utama |
| Telegram delivery worker | Event receipt eligibility setelah commit sukses | Pengiriman credential sekali dan unknown-outcome guard |
| Web delivery readiness/download | Event eligibility dari READY/SENT yang sah | Pemilik order, enkripsi, jumlah download, existing completion |
| Refund utama | Event reversal seller pada commit refund sah | Refund customer dan policy eligibility |
| Katalog/search/carousel | Seller public label dan visibility predicate yang sama | Cache dan pencarian lokal yang ada |
| Scheduler | Worker seller terpisah dengan batch kecil | Interval/payment workers lama |
| Admin actions | UI seller review/withdrawal terpisah | Admin auth, confirmation modal, originating returnTo |

### 13.1 Event tambahan yang disarankan

```text
SELLER_PAYMENT_RECOGNIZED
SELLER_FULFILLMENT_ELIGIBLE
SELLER_REFUND_RECORDED
SELLER_DISPUTE_HELD
SELLER_DISPUTE_RESOLVED
```

- Event berasal dari fakta bisnis yang sudah committed atau dimasukkan ke outbox dalam transaksi yang sama.
- Event outbox unik per sumber; worker ledger boleh retry.
- Jangan menerbitkan notifikasi seller langsung dari transaksi pembayaran sebelum commit.
- Untuk event yang dimasukkan dalam transaksi pembayaran, kegagalan insert tetap dapat membatalkan transaksi tersebut. Risiko ini harus diuji; tidak boleh diklaim "sama sekali tidak memengaruhi payment".
- Worker seller melakukan ledger posting + menandai event selesai secara atomik.
- Jika event datang tidak berurutan, cek versi/state sumber. Refund tidak boleh dilepas kembali menjadi available oleh event release yang terlambat.
- Reconciliation mendeteksi earning/event yang hilang dari snapshot seller eligible, tanpa membuat earning untuk order platform lama.
- Event dan job seller tidak melakukan `sendDocument` atau konfirmasi provider kedua.

## 14. Locking dan transaksi finansial

Tujuannya: request ganda, worker paralel, serta dua admin tidak menggandakan saldo atau pengiriman.

Aturan yang perlu ditulis sebagai satu kontrak sebelum implementasi:

- Alur pembayaran utama mempertahankan urutan inventory lock → order/payment lock yang sudah ada.
- Ledger seller diproses setelahnya melalui outbox agar tidak menciptakan urutan lock terbalik dengan payment/stock.
- Operasi ledger/withdrawal memakai satu urutan konsisten: seller wallet lock → withdrawal/sale lock yang diperlukan.
- Reconciliation dan refund seller juga mengikuti urutan tersebut; jangan mengambil order lock setelah wallet lock jika jalur lain mengambil kebalikannya.
- Jika satu operasi menyentuh beberapa objek, urutkan ID secara deterministik.
- Semua transisi uang memakai conditional update/version serta unique source key.
- Tidak ada panggilan jaringan bank/Clerk/Telegram dalam transaksi SQL yang memegang wallet lock.
- Kegagalan jaringan payout diperlakukan sebagai hasil tidak pasti sampai ada bukti; tidak langsung mengganti saldo.

## 15. Cache, pagination, dan kapasitas VPS

Rancangan harus sesuai host sekitar 2 core/4 GB yang dipakai sekarang. Verifikasi kapasitas aktual saat rollout, karena catatan deployment bukan monitoring live.

- Jangan menambah database, Redis, atau message broker baru hanya untuk V1 jika PostgreSQL outbox dan cache yang ada mencukupi.
- Katalog publik tetap cache 60 detik dengan request coalescing. Publish/pause perlu invalidasi yang tepat; checkout tidak mempercayai cache lama.
- Seller sales memakai query terikat seller dan pagination default 20 baris, maksimum 100 sebagai usulan awal.
- Saldo/withdrawal/detail privat menggunakan `private, no-store`.
- Dashboard summary boleh punya cache pendek per seller jika key mencakup sellerId dan invalidasi benar; bukan cache global campuran user.
- Jangan memuat file inventory atau seluruh buyer relation untuk laporan.
- Worker seller disarankan satu slot dahulu, batch kecil misalnya 25, interval 15-30 detik, dan idle backoff. Nilai final ditentukan setelah profiling.
- Worker pembayaran dan delivery mendapat prioritas lebih tinggi daripada analytics seller.
- Seller projection yang tertinggal menampilkan waktu pembaruan, bukan angka yang seolah real-time.
- Batas upload, rate limit draft, withdrawal dan export harus server-side serta tidak hanya process-local jika nantinya replica bertambah.

## 16. Flag dan mekanisme penghentian aman

Nama berikut adalah usulan flag terpisah:

```text
SELLER_PORTAL_ENABLED
SELLER_PRODUCT_SUBMISSION_ENABLED
SELLER_CATALOG_PUBLICATION_ENABLED
SELLER_EARNINGS_RECOGNITION_ENABLED
SELLER_SETTLEMENT_RELEASE_ENABLED
SELLER_WITHDRAWAL_REQUESTS_ENABLED
SELLER_PAYOUT_PROCESSING_ENABLED
SELLER_EVENT_WORKER_ENABLED
```

- Semua flag default false sampai fase terkait lulus.
- Pilot memakai allowlist sellerId di backend.
- Mematikan seller portal tidak membatalkan kewajiban pembayaran seller.
- Saat insiden seller, blokir penjualan/request pencairan baru, tetapi pertahankan mode read-only dan reconciliation yang dibutuhkan.
- Jangan mematikan event capture begitu saja setelah produk seller sudah dijual; fakta earning/refund tetap harus tercatat walaupun release/payout ditahan.
- Flag payout baru tidak boleh mengubah availability QRIS/Binance/USDT untuk customer.

## 17. Migrasi dan kompatibilitas sistem lama

### Strategi expand-first

1. Tambah tabel seller dan field nullable, index serta constraint yang sudah diuji.
2. Jalankan versi aplikasi yang bisa membaca schema baru tetapi seller flag masih mati.
3. Verifikasi semua produk/order lama dengan `sellerId = null` tetap bekerja.
4. Buka management seller untuk pilot, belum publikasi atau payout.
5. Aktifkan snapshot/event untuk transaksi seller baru setelah settlement siap.
6. Jangan mengubah column/tabel lama menjadi wajib, mengganti ID, atau memindahkan data historis pada tahap ini.

### Deployment

- Build backend dan storefront lokal sebagai image Linux; VPS hanya menerima, memverifikasi checksum, load dan menjalankan.
- Review SQL additive sebelum meminta persetujuan migrasi produksi yang spesifik.
- Backup produksi, inspeksi data, backfill atau recovery hanya dilakukan dengan otorisasi yang sesuai aturan workspace. Dokumen ini tidak mengizinkan operasi database produksi tersebut.
- Validasi Compose sebelum restart.
- Jangan memakai alias `app` pada shared edge network untuk worker seller. Gunakan network backend yang sama/hostname yang tidak ambigu.
- Periksa dependency Compose agar start worker tidak menjalankan migration job tanpa disengaja. Gunakan prosedur restart yang sudah direview.
- Health check harus memvalidasi versi schema yang diperlukan tanpa memuat data seller/customer sensitif.

### Rollback

- Matikan capability baru dengan flag dahulu; jangan menjatuhkan tabel/ledger.
- Sebelum ada seller earning, rollback image lama dapat dipertimbangkan setelah kompatibilitas diverifikasi.
- Setelah ada order seller, rollback harus memakai image kompatibel yang tetap merekam event earning/refund. Rollback ke versi yang tidak mengenal seller dapat kehilangan kewajiban finansial.
- Payout PROCESSING/MANUAL_REVIEW tetap held setelah rollback.
- Pending event diproses ulang dengan idempotency key, bukan dihapus.
- Dokumen rollback wajib memisahkan rollback tampilan, penghentian penjualan baru, dan reconciliation uang yang sudah bergerak.

## 18. Tahapan implementasi dan syarat kelulusan

| Fase | Pekerjaan | Syarat sebelum lanjut |
| --- | --- | --- |
| 0 — Finalisasi policy | Putuskan komisi, hold, minimum payout, rekening, review produk | Keputusan bisnis tercatat; tidak ada perubahan produksi |
| 1 — Auth dan ownership | Tabel seller/membership, guard API, shell `/seller`, semua flag mati | Test lintas-owner, role injection, revoked membership dan regresi customer lulus |
| 2 — Draft dan stok | Draft/revision, admin review, upload scoped, karantina | Seller A tidak dapat memodifikasi B; stok reserved/delivered terlindungi |
| 3 — Shadow earnings | Snapshot seller, event outbox, ledger/projection pada staging/pilot tertutup | Paid/refund/manual/duplicate/reorder event menghasilkan angka benar; belum ada withdrawal |
| 4 — Publikasi pilot | Tayang beberapa produk seller terpilih; pembayaran dan delivery utama | End-to-end Web + Telegram terverifikasi, projection cocok, performa tidak merosot |
| 5 — Settlement | Hold, release, dispute dan debt | Ledger seimbang, wallet projection dapat dibangun ulang, race refund/release teruji |
| 6 — Withdrawal pilot | Request, reserve, approve, transfer manual, mark-paid, audit | Double request/admin/retry tidak membayar dua kali; hasil ambigu tetap held |
| 7 — Peluasan | Buka seller lain, laporan dan optimasi | Monitoring stabil, SOP operator jelas, audit pilot ditutup |

**Jangan membuka produk seller kepada pembeli sebelum pencatatan hak seller dan refund-nya siap.** Portal dan draft dapat dirilis lebih awal tanpa membuka penjualan.

Tidak menetapkan tanggal selesai palsu dalam plan ini. Estimasi kalender baru dibuat setelah fase 0, audit field final, dan kapasitas implementasi diketahui.

## 19. Matriks pengujian wajib

### Auth dan ownership

- Customer biasa mengakses seluruh seller mutation → ditolak.
- Seller A menebak productId/draftId/stockId/saleId/withdrawalId milik B → 404/ditolak, tanpa bocoran isi.
- Seller memasukkan sellerId B atau komisi sendiri → diabaikan/ditolak.
- Membership dicabut saat tab masih terbuka → tindakan berikutnya ditolak backend.
- Seller tidak dapat mengakses `/api/admin/*` walaupun mengubah UI atau mengirim request langsung.
- Token issuer/azp salah atau kedaluwarsa → ditolak tanpa fallback ke identitas lain.
- Signed-in server/client parity untuk dashboard seller, seperti regresi Clerk yang sudah diperbaiki.

### Produk dan stock

- Draft/rejected product tidak muncul di semua jalur katalog, search, Telegram dan checkout.
- Publish revisi idempotent; edit paralel menghasilkan version conflict.
- Pause seller/product menutup checkout baru, tetapi tidak merusak paid order.
- Upload duplikat/malform/terlalu besar ditangani tanpa kredensial masuk log.
- Seller tidak dapat reassign, menghapus atau mengambil ulang isi stock reserved/delivered.
- ProductGroup global tidak dapat diubah seller.

### Earning dan saldo

- Satu paid order menghasilkan satu earning per unit.
- Gateway callback + admin approve + retry worker tidak menggandakan earning.
- Wallet-paid checkout menghasilkan snapshot/event yang setara.
- Web READY dan Telegram SENT memakai syarat eligibility yang berbeda tetapi konsisten.
- UNKNOWN delivery dan pending preorder tidak melepaskan saldo.
- Refund sebelum/sesudah release dan sesudah payout menghasilkan reversal/debt yang benar.
- Urutan event terbalik tidak menghidupkan kembali earning yang direfund.
- Order lama null seller tidak menghasilkan earning.
- Nilai komisi berbeda setelah checkout tidak mengubah snapshot lama.
- Journal selalu seimbang; projection sama dengan hasil replay ledger.

### Withdrawal

- Dua request paralel tidak dapat melewati saldo tersedia.
- Idempotency key sama dan payload sama → satu request; payload berbeda → konflik.
- Seller tidak dapat membatalkan request PROCESSING atau PAID.
- Approve dua kali tidak mengurangi saldo dua kali.
- Dua admin memulai transfer → satu attempt aktif.
- Reject/cancel/failed-final melepaskan held tepat sekali.
- Mark-paid dengan referensi duplikat/nominal berbeda ditolak.
- Hasil transfer ambigu tidak auto-retry dan tidak melepas held.
- Pergantian rekening tidak mengganti snapshot request lama.
- Refund bersamaan withdrawal/debt tidak menyebabkan saldo tersedia negatif atau double recovery.

### Regresi dan operasional

- Seluruh test payment webhook authentication, amount collision, expiry, stock concurrency, refund dan delivery dedupe lama tetap lulus.
- Katalog platform, info terjual, login/register, cart, orders dan file download tetap bekerja.
- Semua database test menggunakan database lokal disposable yang terjaga; bukan produksi.
- Jalankan `npm test`, TypeScript, lint dan production build sesuai AGENTS, termasuk storefront.
- Browser QA desktop dan ukuran HP untuk seller upload, sale table, balance, withdrawal review dan error states.
- Saat rollout, periksa DB/app/migrator/scheduler/notification/payment workers/storefront/Caddy/bridge yang terdampak.
- Periksa SSH, Docker, memory/disk, firewall, DNS, TLS dan final public routes; bukan hanya container yang diedit.
- Jangan melakukan transfer atau approval uang sungguhan sebagai smoke test tanpa instruksi operasi spesifik.

## 20. Monitoring dan SOP admin

Tambahan panel monitoring:

- Jumlah event seller pending/failed, oldest event age dan jumlah retry.
- Selisih ledger dengan wallet projection; target selisih nol.
- Sale paid tanpa earning dan refund tanpa reversal.
- Settlement eligible tetapi tertahan worker.
- Withdrawal REQUESTED terlalu lama, PROCESSING tanpa hasil, dan MANUAL_REVIEW.
- Seller debt, dispute terbuka, rekening baru dan payout yang diblokir.
- Kewajiban payout total dibanding informasi kas operasional yang diperiksa admin.

SOP ringkas:

1. Tinjau seller dan rekening sebelum aktivasi.
2. Review produk/revisi; jangan menerbitkan dari form edit langsung tanpa audit.
3. Periksa antrean dan ledger sebelum menyetujui withdrawal.
4. Gunakan satu operator/attempt saat transfer.
5. Catat transfer selesai berdasarkan bukti; jika ragu, gunakan MANUAL_REVIEW.
6. Gunakan reversal/adjustment resmi untuk koreksi, tidak mengedit balance langsung.
7. Setelah incident, rekonsiliasi lebih dahulu sebelum membuka payout kembali.

## 21. Struktur file yang disarankan

```text
storefront/src/app/seller/                         Pages/layout/loading seller
storefront/src/app/api/seller/                     Same-origin BFF routes
storefront/src/components/seller/                  UI seller
storefront/src/lib/seller-api-contract.ts          DTO publik untuk seller

src/app/api/storefront/v1/seller/                  Backend seller API
src/app/admin/sellers/                            Pengelolaan seller
src/app/admin/seller-products/reviews/             Review publikasi
src/app/admin/seller-withdrawals/                  Operasi payout
src/app/api/admin/sellers/                         Admin seller commands
src/app/api/admin/seller-withdrawals/              Admin payout commands
src/components/admin/sellers/                     Shared seller/admin actions

src/server/seller/identity.ts                     Verified membership guard
src/server/seller/permissions.ts                  Capability policy
src/server/seller/ownership.ts                    Scoped object access
src/server/seller/products.ts                     Draft/revision orchestration
src/server/seller/sales.ts                        Seller DTO queries
src/server/seller/commission.ts                   Snapshot calculation
src/server/seller/ledger.ts                       One ledger mutation service
src/server/seller/settlement.ts                   Hold/release/reversal policy
src/server/seller/withdrawal-policy.ts             Shared eligibility
src/server/seller/withdrawals.ts                  Request/review state machine
src/server/seller/payout-accounts.ts              Rekening dan snapshot
src/server/seller/events.ts                       Outbox contracts
src/server/seller/worker.ts                       Bounded event processing
src/server/seller/reconciliation.ts               Drift detection/recovery
src/server/seller/audit.ts                        Safe audit recording
```

File ini melengkapi service lama; bukan alasan memindahkan semua payment/stock ke folder seller. Modul seller tidak mengambil alih ownership workflow customer.

## 22. Keputusan bisnis yang perlu dikunci sebelum coding finansial

| Keputusan | Rekomendasi awal untuk ditinjau |
| --- | --- |
| Cara menjadi seller | Undangan dan aktivasi admin |
| Seller boleh mengelola apa | Draft/revisi, stok sendiri, penjualan dan saldo sendiri |
| Publikasi produk | Review admin pada produk baru dan perubahan material |
| Ownership produk lama | Tetap platform; tanpa backfill otomatis |
| Komisi | Persentase bps tersnapshot; nilainya dipilih owner |
| Penahanan pendapatan | Berlaku setelah fulfillment eligible; durasi dipilih owner |
| Saldo seller | IDR; terpisah dari wallet buyer |
| Metode payout V1 | Transfer bank manual oleh admin |
| Minimum penarikan | Ditentukan owner; contoh Rp50.000 hanya bahan diskusi |
| Fee pencairan | Diputuskan owner dan disnapshot sebelum seller konfirmasi |
| Verifikasi/perubahan rekening | Review admin dan masa tunggu yang disepakati |
| Penanganan refund setelah payout | Debt seller dan hold pencairan berikutnya; audit wajib |
| Detail buyer untuk seller | Masked/minimal sesuai kebutuhan fulfillment |
| Multi-seller invoice | Tidak pada V1 |

Setelah keputusan ini ditinjau, implementasi paling aman dimulai dari **fase 1: identitas, role, ownership, serta portal read-only**, baru produk/stok, ledger, lalu withdrawal. Tidak ada perubahan kode aplikasi, database, deployment, atau pengaturan produksi yang dilakukan oleh pembuatan plan ini.
