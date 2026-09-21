# Rencana eksekusi lokal: Admin Stok Storefront + Portal Seller

Tanggal: 22 September 2026  
Status: **siap dieksekusi lokal, belum ada perubahan production**

## Tujuan

Memindahkan pengalaman **admin stok** ke aplikasi `storefront`, lalu menambahkan
portal seller agar penjual dapat membuat produk miliknya, mengunggah stok,
melihat penjualan, dan mengajukan penarikan saldo. Backend, database, settlement,
delivery, dan worker tetap memakai boundary yang sudah ada sampai seluruh migrasi
lulus pengujian lokal.

Seller tidak mendapat akses ke operasi pembayaran pembeli, refund, approval
manual, saldo customer, stok seller lain, atau isi credential global.

## Batas lingkungan

- Semua perubahan awal dikerjakan di workspace ini dan stack Docker lokal.
- Database memakai PostgreSQL disposable/local dengan volume bernama terpisah;
  tidak menggunakan database VPS dan tidak menjalankan migration production.
- Bot memakai token testing lokal dari `.env.local`/`.env.test` yang tidak masuk
  source control. Bot testing tidak dipasang ke webhook production.
- Storefront testing berjalan di port lokal terpisah dan backend testing memakai
  port lokal terpisah. Domain production, Caddy production, Clerk production,
  wallet production, dan Telegram production tidak disentuh.
- GitHub backup dilakukan sebelum fase eksekusi. Secret, `.env*`, database dump,
  private stock, dan export akun harus tetap di-ignore.

## Fase 0 — Backup sebelum eksekusi

1. Validasi repository tujuan `ReysGG/Bot_Teleram_BWR` dapat diakses.
2. Buat branch/tag backup bertanggal, misalnya `backup/pre-local-admin-seller-20260922`.
3. Commit source dan dokumentasi yang aman; jangan memasukkan credential,
   `node_modules`, `.next`, Docker volume, private stock, atau file export.
4. Push branch backup dan verifikasi commit dengan `git ls-remote`.
5. Simpan checksum archive/source manifest lokal untuk rollback.

Jika repository berisi source lama yang tidak sama, jangan menimpanya secara
paksa. Buat branch backup baru dan laporkan perbedaan sebelum merge.

## Fase 1 — Local dependency dan compose

Tambahkan stack lokal yang terpisah:

```text
storefront-local-app       : Next.js storefront + BFF seller/admin
telegram-local-app         : backend API + Telegram webhook testing
telegram-local-db          : PostgreSQL disposable
telegram-local-worker      : notification/delivery worker
telegram-local-scheduler  : cron loop testing
telegram-local-bot        : long polling atau webhook localhost testing
```

Gunakan `.env.local.admin-seller.example` sebagai template. Secret asli hanya
di file ignored. `docker compose -f docker-compose.local-admin-seller.yml`
harus memiliki project name/volume/network sendiri agar tidak menyentuh stack
production atau disposable test lain.

## Fase 2 — Admin stok di storefront

### Route UI

```text
/admin/inventory
/admin/inventory/available
/admin/inventory/sold
/admin/inventory/banned
/admin/inventory/search
/admin/inventory/[id]
/admin/inventory/[id]/edit
/admin/inventory/[id]/takeout
/admin/products/[id]/stock
```

Route admin tetap server-authenticated. Form yang mengubah stok wajib memiliki
konfirmasi, processing state, idempotency key, dan notice/error code yang jelas.
Pencarian isi stok hanya mengembalikan hasil yang boleh dilihat admin; seller
tidak boleh memakai endpoint tersebut untuk mencari stok global.

### API/BFF

Storefront memakai `/api/admin/*` sebagai BFF lokal yang meneruskan identity
Clerk/admin session ke backend lokal. Tidak ada Prisma import di client component.
Endpoint payment/ledger tetap dipisah dari CRUD stok.

### Acceptance admin stok

- filter available/sold/banned/health bekerja;
- pencarian isi stok tidak membocorkan file seller lain ke seller;
- upload, health check, banned recovery, takeout, dan archive idempotent;
- alokasi ke order tetap memakai transaksi yang sudah ada;
- delivery dan worker tidak dibuat ulang di storefront.

## Fase 3 — Seller identity dan ownership

Implementasikan entitas sesuai `next-plan.md` secara bertahap:

```text
SellerAccount
SellerMembership
SellerInvitation
SellerProductDraft
SellerProductPublication
SellerStockImport
SellerSale
SellerWallet
SellerLedgerTransaction / SellerLedgerEntry
SellerWithdrawal
SellerPayoutAccount
SellerPayoutAttempt
SellerDispute
SellerDomainEvent
```

Semua seller identity diturunkan dari Clerk session + membership backend.
Client tidak boleh mengirim `sellerId`, `ownerId`, fee, saldo, atau status untuk
dipercaya server. Satu akun Clerk menjadi satu seller pada V1.

## Fase 4 — Portal seller

```text
/seller
/seller/onboarding
/seller/products
/seller/products/new
/seller/products/[productId]
/seller/products/[productId]/edit
/seller/products/[productId]/stock
/seller/products/[productId]/stock/upload
/seller/sales
/seller/sales/[saleId]
/seller/balance
/seller/withdrawals
/seller/withdrawals/new
/seller/withdrawals/[withdrawalId]
/seller/payout-accounts
/seller/settings
```

Produk baru masuk draft dan harus disetujui admin sebelum tampil publik. Revisi
produk disimpan sebagai revision; versi live tidak ditimpa diam-diam. Stock
upload memakai parser, fingerprint, encryption, quota, health check, dan hasil
batch yang sama dengan pipeline stok yang ada.

## Fase 5 — Seller settlement dan withdrawal

- `SellerSale` menyimpan snapshot seller, gross, fee, net, order/item, dan status
  settlement saat order dibuat.
- Saldo pending baru menjadi available berdasarkan bukti fulfillment channel;
  `COMPLETED` saja tidak cukup untuk semua channel.
- Withdrawal menahan saldo secara atomik saat dibuat.
- Admin approve dan transfer selesai adalah dua tindakan berbeda.
- Hasil transfer ambigu tidak boleh dianggap paid; harus masuk review.
- Seller tidak boleh confirm payment, refund, edit saldo, atau resend file.
- Semua adjustment memiliki actor, alasan, source/idempotency key, dan audit.

## Fase 6 — Review UI dan aset dengan ChatGPT melalui Chrome

Setelah route dan DTO stabil, minta ChatGPT meninjau dua viewport memakai aset
publik BWR Tele dan data sintetis:

1. Admin inventory: tabel desktop, kartu mobile, filter health/status, search
   content, bulk action yang aman, dan state loading/error.
2. Seller dashboard: ringkasan penjualan, saldo pending/available, stock health,
   onboarding, dan withdrawal timeline.
3. Seller product editor: draft/review/rejected/live dengan perbandingan revision.
4. Admin seller review: queue seller/product/withdrawal dan audit trail.

Output harus disimpan lokal di `design/admin-seller/`. Asset generatif harus
dioptimalkan WebP/AVIF, memakai brand BWR Tele, dan tidak berisi angka stok,
saldo, token, atau data customer nyata. Implementasi memakai komponen reusable
dan CSS Modules/global CSS yang sudah dipakai storefront; tidak menambah
framework styling baru tanpa alasan.

## Fase 7 — Validasi lokal wajib

```bash
npm test
npx --no-install tsc --noEmit
npm run lint
npm run build
npx vitest run --config storefront/qa/sms.config.ts
docker compose -f docker-compose.local-admin-seller.yml config
```

Tambahkan test untuk:

- seller ownership dan akses admin/seller;
- invitation expiry/one-time accept;
- draft/revision approval;
- stock upload duplicate/fingerprint/encryption;
- seller sale snapshot dan refund hold;
- withdrawal atomic hold, approve, reject, mark-paid, failed, ambiguous;
- admin cannot accidentally expose seller/customer stock;
- webhook authentication, payment idempotency, stock concurrency, expiry,
  delivery deduplication, dan worker retry.

## Fase 8 — Local end-to-end dengan bot testing

1. Jalankan bot testing dengan long polling atau webhook lokal yang eksplisit.
2. Buat seller synthetic melalui invitation admin.
3. Buat draft produk, submit review, approve sebagai admin.
4. Upload synthetic stock, jalankan health check, dan beli melalui customer test.
5. Verifikasi order masuk, delivery sekali, `SellerSale` terbentuk, saldo
   pending muncul, dan withdrawal menahan saldo.
6. Uji reject/refund/dispute dan pastikan saldo seller tidak salah dilepas.
7. Hapus/reset hanya database lokal disposable setelah evidence disimpan.

## Definition of done sebelum production dibahas

- Backup GitHub sudah diverifikasi.
- Local compose seluruh service sehat dan dapat diulang dari kosong.
- Admin stok storefront lulus ownership/idempotency/secret-boundary tests.
- Seller pilot end-to-end lulus dengan bot dan customer synthetic.
- UI desktop/mobile sudah direview dan aset tersimpan lokal.
- Tidak ada perubahan production, webhook production, database production,
  domain production, atau feature flag production.
- Baru setelah user meminta eksplisit, dibuat rollout plan production terpisah.
