# Plan pemindahan `src` Telegram ke `storefront`

## Keputusan awal

Pemindahan tidak dilakukan dengan menyalin seluruh folder `src` sekaligus.
Saat ini root app adalah aplikasi backend + bot + admin + worker yang memakai
Prisma dan satu database, sedangkan `storefront` adalah Next.js browser app
yang memanggil backend melalui API proxy. Menyatukan keduanya secara buta akan
mengubah routing, secret boundary, Docker image, worker commands, dan import
alias pada saat yang sama.

Target yang aman adalah **satu source tree Next.js untuk route web dan API**,
dengan worker Telegram/scheduler tetap menjadi proses terpisah di image yang
sama atau entrypoint terpisah. Database dan model Prisma tetap satu sumber,
tetapi credential server tidak boleh masuk ke bundle browser.

## Inventaris saat ini

| Area | Root `src` | `storefront/src` | Keputusan |
| --- | --- | --- | --- |
| Browser shop/account/cart/checkout | API backend di `src/app/api/storefront` | ~50 route UI dan proxy | Pindahkan UI ke tree gabungan; hapus proxy bertahap setelah route internal tervalidasi |
| Admin | `src/app/admin/**`, `src/app/api/admin/**` | Tidak ada | Pindahkan sebagai route server-only; pertahankan admin session boundary |
| Telegram webhook/flows | `src/app/api/telegram`, `src/server/telegram/**` | Tidak ada | Pindahkan server-only; tetap dilayani worker/webhook process |
| Cron/worker | `src/app/api/cron/**`, `src/server/**` | Tidak ada | Tetap server-only; command Compose tidak boleh berubah sebelum health check |
| Prisma/database | `prisma/**`, `src/server/db/**` | Tidak ada | Pindahkan bersama konfigurasi server, tanpa migration/reset produksi |
| Public assets/CSS | root `public`, root `src/app/globals.css` | `storefront/public`, `storefront/src/app/globals.css` | Gabungkan setelah collision audit; asset path harus diuji |
| Dependency | Prisma, pg, Clerk backend, provider SDK, sharp | Clerk frontend + Next | Gabungkan lockfile setelah import graph lulus |

Root route tree saat ini sekitar 174 file di bawah `src/app`; storefront
memiliki sekitar 50 route UI/proxy. Root `tsconfig` sengaja mengecualikan
`storefront`, sehingga dua aplikasi sekarang memang dibangun terpisah.

## Target layout

```text
storefront/
  src/app/                 # UI publik + admin + API route server
  src/components/          # komponen browser/server
  src/server/              # kode server Telegram, payment, worker, Prisma
  prisma/                  # schema dan migrations (atau symlink-free copy)
  public/                  # satu public asset tree
  scripts/                 # bot/worker/configuration scripts
  Dockerfile.web           # Next standalone web
  Dockerfile.worker        # webhook/worker entrypoint bila diperlukan
```

Nama `src/server` dipertahankan agar import server-only mudah diaudit. Kode
yang memakai `process.env`, Prisma, Telegram token, provider secret, atau
encryption key tidak boleh diimpor oleh client component. Tambahkan guard
`server-only` pada modul sensitif dan jalankan client-boundary check di CI.

## Tahap migrasi

### 0. Baseline dan freeze boundary

1. Catat image, Compose service, route health, dan test baseline.
2. Pastikan tidak ada perubahan produksi/database selama migrasi awal.
3. Tambahkan contract tests untuk storefront API yang sekarang dipakai proxy.
4. Tetapkan `storefront` sebagai target source tree baru tanpa menghapus root
   app lama sampai cutover selesai.

### 1. Gabungkan dependency dan konfigurasi build

1. Gabungkan dependency root dan storefront secara deterministik ke satu
   `package.json`/lockfile; pertahankan versi Next/React/TypeScript saat ini.
2. Pindahkan alias `@/*` ke `storefront/src/*` dan ubah import root secara
   mekanis, lalu jalankan typecheck.
3. Gabungkan `next.config`, `eslint`, `tsconfig`, `next-env`, dan environment
   contract tanpa menyalin secret.
4. Tambahkan Docker build target web/worker; jangan mengubah Compose produksi
   sebelum image baru lulus seluruh fleet check.

### 2. Pindahkan shared server modules

Urutan: `src/server/env`, `db`, `utils`, wallet/ledger, catalog, orders,
files, dan provider adapters. Setelah itu pindahkan SMSPool web adapter yang
sudah dibuat. Setiap batch harus lulus root tests, storefront tests, typecheck,
lint, dan build.

### 3. Pindahkan API route

1. Pindahkan route `/api/storefront/v1/**` terlebih dahulu dan arahkan UI
   langsung ke route internal.
2. Pindahkan `/api/admin/**`, `/api/catalog/**`, dan payment/bridge routes.
3. Pindahkan webhook Telegram dan cron route terakhir.
4. Pertahankan response/error contract dan idempotency key; jangan membuat
   settlement/payment mutation kedua.
5. Proxy lama diberi deprecation notice sementara, lalu dihapus setelah log
   tidak menunjukkan pemakaian.

### 4. Pindahkan UI dan admin

Pindahkan komponen/root UI secara bertahap, mulai dari layout/header/footer,
shop/account/cart/checkout, SMS, lalu admin. Admin tetap server-authenticated
dan tidak boleh menjadi client bundle. Route payment settings, ledgers,
reconciliation, inventory, dan broadcast tetap terpisah sesuai aturan admin.

### 5. Worker dan cutover

1. Buat entrypoint worker dari source tree yang sama, tetapi proses tetap
   terpisah dari web request process.
2. Jalankan disposable DB test dan Compose smoke stack.
3. Verifikasi webhook authentication, cron auth, payment idempotency, stock
   concurrency, expiry restoration, delivery deduplication, serta SMS owner
   scoping.
4. Deploy canary image tanpa mematikan image lama, health-check semua service,
   lalu cutover reverse proxy.
5. Hapus root app lama hanya setelah rollback image, route, worker, dan public
   health check terbukti.

## Tidak boleh dilakukan pada tahap awal

- Tidak menyalin `.env`, token Telegram, database URL, encryption key, atau
  credential provider ke repository/storefront.
- Tidak menjalankan migration/reset/truncate terhadap database produksi.
- Tidak menggabungkan worker ke proses Next.js request karena akan mengubah
  retry, memory, dan lifecycle scheduler.
- Tidak menghapus root `src` atau Compose lama sebelum rollback teruji.
- Tidak mengubah domain atau deploy produksi hanya karena source sudah tersalin.

## Definition of done

- Satu source tree storefront dapat membangun web image dan worker image.
- Semua route publik, admin, API, webhook, cron, dan SMS lulus contract test.
- Tidak ada secret/server module di client bundle.
- Semua service Compose (DB, migrate, web, scheduler, notification worker,
  reverse proxy/bridge yang terdampak) sehat dan worker endpoint merespons.
- Rollback ke image root lama dapat dilakukan tanpa perubahan database destruktif.
- Baru setelah itu production cutover boleh direncanakan sebagai langkah terpisah.
