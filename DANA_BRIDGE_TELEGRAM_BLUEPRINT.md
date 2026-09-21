# DANA Bridge and Telegram Sales Bot Blueprint

Dokumen ini mencatat struktur DANA Notification Bridge dan bot Telegram toko pada Market Project. Gunakan sebagai blueprint ketika membuat bot Telegram khusus jualan atau memisahkan bot operasional dari bot toko.

Penting: DANA Bridge bukan API resmi DANA dan bukan pengganti webhook merchant resmi. Bridge membaca notifikasi Android dari aplikasi DANA/DANA Bisnis, lalu mengirim event yang ditandatangani ke server.

## 1. Tujuan Sistem

Sistem menghubungkan lima bagian:

1. Bot Telegram membuat order memakai business logic website yang sama.
2. Checkout membuat nominal pembayaran yang unik untuk invoice aktif.
3. Aplikasi Android menangkap notifikasi dana masuk dari DANA.
4. Server mencocokkan nominal dan waktu notifikasi dengan tepat satu invoice.
5. Order dikonfirmasi, stok digital dialokasikan, lalu produk dikirim ke pembeli melalui Telegram.

```text
Pembeli
  -> Telegram Bot
  -> Checkout dan reservasi stok
  -> Invoice pending_payment

DANA / DANA Bisnis di HP merchant
  -> Android NotificationListenerService
  -> Persistent queue
  -> Signed HTTPS webhook
  -> PaymentNotificationEvent
  -> Exact invoice matching
  -> Payment + Order = paid
  -> Digital fulfillment
  -> Telegram notification queue
  -> Pembeli menerima produk
```

## 2. Struktur Folder Utama

```text
android/dana-notification-bridge/
  README.md
  app/src/main/AndroidManifest.xml
  app/src/main/java/com/buildwithreys/danabridge/
    MainActivity.java
    DanaNotificationListener.java
    BridgeForegroundService.java
    BridgeSender.java
    BridgeQueue.java
    BridgeEvent.java
    BridgeConfig.java
    BridgeSecretStore.java
    BootReceiver.java

src/app/api/webhooks/dana-business/
  notification/route.ts
  heartbeat/route.ts

src/server/payment/
  dana-notification-bridge-values.ts
  dana-notification-bridge.ts
  dana-bridge-status.ts

src/app/api/telegram/
  webhook/route.ts

src/server/telegram/
  checkout-flow.ts
  bot-api.ts
  admin-payment-confirm.ts
  notification-message.ts

src/server/data/
  telegram-checkout-store.ts
  telegram-notification-store.ts
  telegram-update-store.ts

src/app/api/cron/
  payments/expire/route.ts
  telegram/notifications/route.ts

src/server/digital-stock/
  fulfillment.ts
  encryption.ts

src/server/data/
  digital-stock-store.ts
  prisma-store.ts
```

## 3. Environment Variables

Jangan menyalin nilai secret dari project lama. Buat secret baru untuk setiap deployment.

### 3.1 DANA Android Bridge

```env
DANA_BRIDGE_ENABLED=true
DANA_BRIDGE_AUTO_CONFIRM=true
DANA_BRIDGE_SECRET="random-secret-minimal-32-karakter"

# Optional comma-separated overrides.
DANA_BRIDGE_INCOMING_PHRASES=""
DANA_BRIDGE_EXCLUDED_PHRASES=""
```

### 3.2 Telegram Bot

```env
TELEGRAM_BOT_TOKEN="token-dari-botfather"
TELEGRAM_WEBHOOK_SECRET="random-secret-webhook"
APP_CRON_SECRET="random-secret-cron"

# Fallback only if APP_CRON_SECRET is not set.
CRON_SECRET="random-secret-cron-lama"
```

### 3.3 Core Order and Digital Delivery

```env
NEXTAUTH_URL="https://domain-toko.example"
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
DIGITAL_STOCK_ENCRYPTION_KEY="32-byte-key-base64-or-64-char-hex"
```

`DIGITAL_STOCK_ENCRYPTION_KEY` tidak boleh dirotasi tanpa proses re-enkripsi stok lama. Key yang sama juga dipakai untuk mengenkripsi pesan produk digital yang antre di tabel Telegram.

### 3.4 Admin Recipient

Chat ID admin bukan environment variable. Nilainya disimpan pada setting marketplace:

```text
Admin -> Settings -> Telegram Admin Chat IDs
```

Admin dapat mengirim `/myid` ke bot untuk melihat chat ID.

## 4. Android Bridge

### 4.1 Package dan Versi

```text
Application ID : com.buildwithreys.danabridge
Minimum SDK    : 26
Target SDK     : 36
Java           : 17
Version        : 1.2.1 (versionCode 10)
```

Package DANA yang diterima:

```text
id.dana
id.dana.kasir
```

Package lain tidak diteruskan. Jika teks terlihat seperti pembayaran DANA tetapi package belum diizinkan, aplikasi hanya mencatat diagnostik.

### 4.2 Permission Android

```text
INTERNET
FOREGROUND_SERVICE
FOREGROUND_SERVICE_SPECIAL_USE
RECEIVE_BOOT_COMPLETED
POST_NOTIFICATIONS
REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
```

Notification listener memakai permission khusus:

```text
android.permission.BIND_NOTIFICATION_LISTENER_SERVICE
```

### 4.3 Capture Event

`DanaNotificationListener` membaca:

```text
Notification.EXTRA_TITLE
Notification.EXTRA_TITLE_BIG
Notification.EXTRA_BIG_TEXT
Notification.EXTRA_TEXT
Notification.EXTRA_SUB_TEXT
Notification.EXTRA_SUMMARY_TEXT
Notification.EXTRA_INFO_TEXT
tickerText
```

Batas sebelum dikirim:

```text
title <= 500 karakter
body  <= 2000 karakter
```

Event ID dibuat dari SHA-256 atas kombinasi:

```text
notification key + post time + title + body
```

Ini membuat retry idempotent dan mencegah notifikasi yang sama diproses dua kali.

### 4.4 Event Payload

```json
{
  "eventId": "sha256-event-id",
  "deviceId": "android-generated-uuid",
  "packageName": "id.dana",
  "title": "Pembayaran diterima",
  "body": "Kamu menerima Rp25.347",
  "postedAt": "2026-07-29T10:00:00.000Z"
}
```

Jangan menambahkan token, password, nomor rekening, atau secret ke body payload.

### 4.5 Signature HTTP

Headers:

```text
Content-Type: application/json; charset=utf-8
X-Bridge-Timestamp: 13-digit Unix milliseconds
X-Bridge-Signature: lowercase hex HMAC-SHA256
```

String yang ditandatangani:

```text
timestamp + "." + rawJsonBody
```

Pseudo-code:

```text
signature = hex(hmac_sha256(DANA_BRIDGE_SECRET, timestamp + "." + rawBody))
```

Server membandingkan signature dengan constant-time comparison dan menolak timestamp yang berbeda lebih dari 5 menit.

Raw body harus identik. Perubahan spasi setelah signature dibuat membuat signature tidak valid.

### 4.6 Persistent Queue dan Retry

`BridgeQueue` menyimpan maksimal 200 event di SharedPreferences.

Kebijakan pengiriman:

| Hasil | Tindakan Android |
| --- | --- |
| HTTP 2xx | Hapus event dari antrean |
| Network error / HTTP 5xx | Simpan dan retry |
| HTTP 401 | Simpan dan retry karena secret mungkin sedang diperbaiki |
| HTTP 408/425/429 | Simpan dan retry |
| HTTP 4xx lain | Buang event karena dianggap invalid permanen |

Flush berhenti pada transient failure pertama supaya urutan event tetap terjaga.

### 4.7 Reliability

```text
Foreground maintenance tick : setiap 5 menit
Alarm watchdog              : setiap 15 menit
Heartbeat                   : sekitar setiap 5 menit
Server stale threshold      : 35 menit
Stale alert cooldown        : 30 menit
```

Reliability layer:

- Foreground service tipe `specialUse`.
- Persistent notification `Bridge DANA aktif`.
- `START_STICKY` service.
- Auto-start setelah boot.
- Listener rebind otomatis.
- Toggle component setelah listener gagal dua tick berturut-turut.
- Queue flush pada listener connect dan maintenance tick.
- AlarmManager membangunkan maintenance ketika handler tertunda.

HP merchant sebaiknya selalu terhubung charger, battery optimization dimatikan, dan autostart vendor diaktifkan.

### 4.8 Secret Storage Android

Secret disimpan dengan:

```text
Android Keystore
AES/GCM/NoPadding
random IV
128-bit authentication tag
```

Secret tidak ditanam dalam APK dan `allowBackup=false` mencegah backup aplikasi membawa konfigurasi.

## 5. Server Webhook Contract

### 5.1 Notification Endpoint

```text
POST /api/webhooks/dana-business/notification
Maximum raw body: 8 KB
```

Urutan validasi:

1. `DANA_BRIDGE_ENABLED` harus tepat `true`.
2. Secret server minimal 32 karakter.
3. Raw body tidak melebihi 8 KB.
4. Timestamp dan HMAC valid.
5. Payload JSON valid.
6. Semua field wajib valid dan berada dalam batas panjang.
7. Event diproses secara idempotent memakai `eventId` unique.

Response mengikuti contract API project:

```json
{
  "ok": true,
  "data": {
    "status": "confirmed",
    "invoiceNumber": "BWR-..."
  }
}
```

Status HTTP penting:

| Status | Arti |
| --- | --- |
| 200 | Event diterima atau diproses |
| 400 | JSON/payload invalid |
| 401 | Signature invalid |
| 413 | Payload terlalu besar |
| 500 | Database atau processing gagal, Android harus retry |
| 503 | Bridge belum aktif atau konfigurasi server belum lengkap |

### 5.2 Heartbeat Endpoint

```text
POST /api/webhooks/dana-business/heartbeat
Maximum raw body: 2 KB
```

Payload:

```json
{
  "deviceId": "android-generated-uuid",
  "queueSize": 0
}
```

Signature memakai kontrak yang sama dengan notification endpoint.

Server menyimpan status pada setting key:

```text
dana_bridge_status
```

Data yang disimpan:

```text
lastSeenAt
deviceId
queueSize
lastStaleAlertAt
```

## 6. Klasifikasi Notifikasi

Urutan klasifikasi di server:

1. Package harus `id.dana` atau `id.dana.kasir`.
2. Teks harus mengandung frasa incoming dan tidak mengandung excluded phrase.
3. Nominal Rupiah harus dapat dibaca.
4. Notifikasi harus mengandung tepat satu nominal unik.
5. Cari payment aktif dengan `billedAmount` yang sama.
6. Waktu notifikasi harus berada di antara invoice dibuat dan invoice kedaluwarsa, dengan toleransi clock skew 5 menit.
7. Hanya tepat satu invoice yang boleh cocok.

Status event:

| Status | Kondisi |
| --- | --- |
| `rejected_package` | Package Android tidak diizinkan |
| `ignored_content` | Frasa transaksi masuk tidak dikenali atau mengandung excluded phrase |
| `parse_failed` | Nominal tidak ditemukan |
| `ambiguous_amounts` | Teks memuat lebih dari satu nominal |
| `unmatched` | Tidak ada invoice aktif dengan nominal tersebut |
| `ambiguous` | Lebih dari satu invoice aktif memiliki nominal sama |
| `matched` | Tepat satu invoice cocok, auto-confirm mati |
| `confirmed` | Payment dan order berhasil dikonfirmasi |
| `confirmed_fulfillment_failed` | Lunas berhasil tetapi pengiriman produk digital gagal |
| `duplicate` | `eventId` sudah pernah diterima |

Default incoming phrases:

```text
pembayaran diterima, dana masuk, uang masuk, transaksi masuk,
pembayaran masuk, kamu menerima, anda menerima, berhasil menerima,
menerima pembayaran, menerima dana, menerima saldo, menerima uang,
dana diterima, saldo masuk, terima uang
```

Default excluded phrases:

```text
cashback, voucher, promo, hadiah, bonus, top up, top-up,
isi ulang, isi saldo, refund, pengembalian dana
```

## 7. Pencegahan Salah Match Pembayaran

Bridge tidak memilih invoice hanya berdasarkan pembeli, chat ID, atau waktu. Kunci utama adalah nominal final yang tepat.

Untuk payment non-hosted seperti QRIS dynamic/manual transfer, checkout menambahkan biaya layanan unik Rp100-Rp998. Alokasi memakai PostgreSQL advisory lock sehingga checkout bersamaan tidak menerima nominal aktif yang sama.

```text
base total Rp25.000 + biaya layanan Rp347 = billedAmount Rp25.347
```

Bridge hanya auto-confirm bila notifikasi memuat Rp25.347 dan hanya satu invoice aktif memiliki billed amount tersebut.

Pembayaran dengan method berikut sengaja tidak diproses DANA Notification Bridge:

```text
doku_checkout
dana_checkout
```

Hosted gateway harus memakai webhook/reconciliation provider sendiri.

## 8. Database Structure

### 8.1 PaymentNotificationEvent

```text
id              cuid primary key
eventId         unique Android event ID
deviceId        bridge device ID
packageName     source Android package
title           notification title
body            notification body
postedAt        timestamp dari Android notification
receivedAt      timestamp server menerima event
amount          nominal hasil parsing
status          classification/processing status
paymentId       matched payment
orderId         matched order
invoiceNumber   matched invoice
reason          failure/attention reason
payloadHash     SHA-256 payload
confirmedAt     payment confirmation time
createdAt
updatedAt
```

Indexes:

```text
unique(eventId)
index(status, postedAt)
index(paymentId)
index(orderId)
```

### 8.2 TelegramCheckoutSession

Menyimpan state conversation per chat:

```text
chatId primary key
broadcastEnabled
state
cart JSON
voucherCode
buyerName
buyerEmail
buyerWhatsapp
shippingAddress
shippingCity
shippingProvince
shippingPostalCode
paymentSenderName
paymentSenderBank
paymentTransferredAmount
checkoutKey
orderId unique
createdAt
updatedAt
```

### 8.3 TelegramNotification

Outbox untuk pesan asynchronous:

```text
chatId
orderId
productId
message
status: pending | processing | sent | failed
attempts
nextAttemptAt
sentAt
lastError
createdAt
```

### 8.4 TelegramProcessedUpdate

Mencegah update Telegram diproses dua kali:

```text
updateId primary key
chatId
createdAt
expiresAt
```

Update ID disimpan 7 hari. Notification sent/failed yang berumur lebih dari 30 hari dibersihkan ketika notification worker berjalan.

## 9. Telegram Sales Bot

Bot yang ada sebenarnya sudah merupakan bot toko. Fitur saat ini:

- Katalog dan pencarian.
- Detail produk, gambar, varian, stok, dan preorder.
- Keranjang dan voucher.
- Checkout memakai transaction dan stock reservation website.
- QRIS image/payload dikirim ke chat.
- Hosted DANA/DOKU checkout link bila provider aktif.
- Upload bukti pembayaran manual.
- Riwayat order.
- Broadcast produk baru.
- Admin one-tap payment confirmation.
- Delivery produk digital terenkripsi melalui notification queue.

Commands:

```text
/start
/catalog
/cart
/orders
/subscribe
/unsubscribe
/helper
/help
/myid
```

Callback groups:

```text
catalog
catalog:<page>
product:<productId>
add:<productId>
variant:<productId>:<variantIndex>
buy:<productId>
buy_variant:<productId>:<variantIndex>
cart
cart_dec:<index>
cart_remove:<index>
cart_clear
voucher
checkout
search
notifications
subscribe
unsubscribe
dana_pay
doku_pay
adm_confirm:<orderId>
```

State machine:

```text
browsing
awaiting_search
awaiting_voucher
awaiting_name
awaiting_email
awaiting_whatsapp
awaiting_address
awaiting_city
awaiting_province
awaiting_postal_code
awaiting_payment_details
awaiting_payment_proof
completed
```

## 10. Telegram Webhook Setup

Endpoint:

```text
POST /api/telegram/webhook
```

Telegram harus mengirim header:

```text
X-Telegram-Bot-Api-Secret-Token: TELEGRAM_WEBHOOK_SECRET
```

Set webhook:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<DOMAIN>/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Jangan menaruh bot token atau webhook secret di source code, README publik, chat, screenshot, atau APK.

## 11. Telegram Notification Worker

Endpoint worker:

```text
GET or POST /api/cron/telegram/notifications
Authorization: Bearer APP_CRON_SECRET
```

Jadwal yang disarankan:

```text
setiap 1 menit
```

Worker behavior:

```text
batch size       : 25
lease processing : 5 menit
max attempts     : 5
retry delay      : min(60 menit, 2^attempt menit)
```

Pesan digital disimpan terenkripsi dalam outbox dan baru didekripsi saat dikirim. Dashboard admin hanya menampilkan placeholder untuk pesan digital terenkripsi.

Catatan deployment saat dokumentasi ini dibuat: `vercel.json` hanya menjadwalkan `/api/cron/payments/expire`. Endpoint `/api/cron/telegram/notifications` wajib ditambahkan ke scheduler Vercel atau scheduler eksternal. Tanpa worker ini, notifikasi fulfillment yang masuk queue tidak akan terkirim otomatis.

## 12. Payment Confirmation Transaction

Jika event cocok dan auto-confirm aktif, server menjalankan transaction:

1. Lock logical state melalui conditional `updateMany`.
2. Pastikan event masih `matched`.
3. Pastikan payment masih `pending_payment` atau `rejected`.
4. Pastikan order masih `pending_payment`.
5. Pastikan invoice belum kedaluwarsa.
6. Pastikan nominal event sama dengan `billedAmount`.
7. Set payment menjadi `paid` dan isi verifier/time/amount.
8. Set order dan `paymentStatus` menjadi `paid`.
9. Tambahkan `OrderStatusHistory`.
10. Update statistik customer.
11. Set event menjadi `confirmed`.
12. Simpan audit log.

Setelah transaction sukses, digital fulfillment dijalankan di luar transaction payment.

Jika fulfillment gagal, pembayaran tidak dibatalkan. Event berubah menjadi `confirmed_fulfillment_failed` dan admin menerima alert untuk memperbaiki stok/encryption key.

## 13. Digital Fulfillment

Fulfillment memakai PostgreSQL advisory lock per order dan `FOR UPDATE SKIP LOCKED` ketika memilih stok digital.

Guarantee:

- Satu stock item hanya dialokasikan ke satu order.
- Retry order yang sama idempotent.
- Concurrent buyers menerima credential berbeda.
- Digital-only order otomatis menjadi `completed` setelah seluruh item terkirim.
- Mixed physical/digital order tidak auto-complete.
- Jika stok kosong, order tetap paid dan admin diberi alert.
- Ketika stok baru ditambahkan, paid order lama diproses FIFO.

Delivery Telegram hanya dibuat bila order memiliki `TelegramCheckoutSession` yang mengarah ke chat pembeli.

## 14. Admin One-Tap Confirmation

Jika auto-confirm mati atau notification phrase tidak dikenali tetapi nominal cocok, admin dapat menerima tombol:

```text
callback_data = adm_confirm:<orderId>
```

Sebelum approve, server memverifikasi bahwa chat ID termasuk `telegramAdminChatIds`.

Admin callback memanggil business function `approvePayment`, bukan update database langsung. Karena itu audit, fulfillment, dan notification flow tetap konsisten dengan admin website.

## 15. Membuat Bot Telegram Kedua

### Pilihan A - Gunakan bot toko yang ada (direkomendasikan)

Paling sederhana dan aman:

- Gunakan `TELEGRAM_BOT_TOKEN` yang ada sebagai bot jualan.
- Tambahkan branding dan menu baru pada `checkout-flow.ts`.
- Reuse seluruh order, payment, stock, voucher, dan fulfillment.
- DANA Bridge tidak perlu diubah.

### Pilihan B - Bot kedua yang benar-benar terpisah

Jangan hanya menambahkan token kedua ke `bot-api.ts`. Struktur database saat ini menganggap hanya ada satu bot.

Tambahkan identitas bot, misalnya:

```text
TelegramBotKey = store | sales
```

Perubahan schema yang diperlukan:

```text
TelegramCheckoutSession:
  add botKey
  primary/unique identity menjadi (botKey, chatId)

TelegramProcessedUpdate:
  add botKey
  unique identity menjadi (botKey, updateId)

TelegramNotification:
  add botKey
  sender memilih token berdasarkan botKey
```

Alasannya:

- `chatId` dapat sama untuk user yang memakai dua bot.
- `update_id` hanya unik dalam satu bot, bukan lintas bot.
- Outbox saat ini selalu dikirim memakai `TELEGRAM_BOT_TOKEN` tunggal.
- Tanpa `botKey`, produk yang dibeli melalui bot kedua dapat terkirim dari bot pertama.

Environment bot kedua yang disarankan:

```env
TELEGRAM_SALES_BOT_TOKEN=""
TELEGRAM_SALES_WEBHOOK_SECRET=""
```

Route baru:

```text
POST /api/telegram-sales/webhook
```

Payment/order/stock function tetap shared. Yang dipisahkan hanya transport Telegram dan conversation session.

## 16. Gap dan Risiko yang Harus Diperbaiki

### P0 - Checkout data flow Telegram

State `awaiting_name`, `awaiting_email`, dan seterusnya tersedia, tetapi `requestCheckoutDetails` saat ini langsung membuat order dan tidak mengarahkan session ke state tersebut.

Produk digital sekarang mewajibkan email valid. Bot baru harus:

```text
if cart contains digital and email missing:
  state = awaiting_email
else if cart contains physical and shipping data incomplete:
  state = awaiting_name/address/...
else:
  create order
```

Jangan menyalin perilaku langsung-create-order sebelum gap ini diperbaiki.

### P0 - Telegram notification scheduler

`/api/cron/telegram/notifications` belum terdaftar pada `vercel.json`. Tambahkan scheduler setiap menit atau gunakan external cron.

### P1 - Multiple bridge devices

Bridge status hanya memakai satu setting key. Device terakhir menimpa `deviceId` dan `queueSize` sebelumnya. Jika memakai lebih dari satu HP, buat tabel status per device.

### P1 - Shared bridge secret

Semua device memakai satu `DANA_BRIDGE_SECRET`. Untuk multi-device production, simpan device provisioning record dan secret/hash per device agar satu HP dapat dicabut tanpa merotasi semua device.

### P1 - Notification data retention

`PaymentNotificationEvent.title` dan `body` disimpan plaintext dan dapat memuat nama pembayar. Tambahkan retention job, misalnya menghapus atau meredaksi event lebih tua dari 30-90 hari.

### P1 - Android release signing

Build `release` saat ini memakai debug signing config. Sebelum distribusi production, gunakan release keystore terpisah dan simpan credential signing di tempat aman.

### P2 - Phrase maintenance

Template notifikasi DANA dapat berubah. Pantau `ignored_content`, `parse_failed`, dan `ambiguous_amounts`, lalu update incoming/excluded phrase secara hati-hati.

## 17. Deployment Checklist

### Server

- [ ] Migration Prisma sudah diterapkan.
- [ ] `DANA_BRIDGE_ENABLED=true`.
- [ ] `DANA_BRIDGE_AUTO_CONFIRM=true` setelah test selesai.
- [ ] Secret bridge minimal 32 karakter.
- [ ] Telegram bot token dan webhook secret terpasang.
- [ ] Digital stock encryption key terpasang.
- [ ] Admin chat IDs tersimpan.
- [ ] Telegram webhook sudah didaftarkan.
- [ ] Telegram notification worker berjalan tiap menit.
- [ ] Payment expiry/stale bridge cron berjalan.
- [ ] HTTPS aktif.

### Android

- [ ] Endpoint notification production benar.
- [ ] Secret sama dengan server.
- [ ] Restricted settings diizinkan.
- [ ] Notification access aktif.
- [ ] Foreground notification permission aktif.
- [ ] Battery optimization dimatikan untuk bridge dan DANA.
- [ ] Vendor autostart aktif.
- [ ] Listener status connected.
- [ ] Test connection HTTP 200.
- [ ] Heartbeat terlihat pada server.
- [ ] Queue kembali ke 0 setelah event test.

### End-to-End Test

- [ ] Buat invoice nominal kecil.
- [ ] Pastikan billed amount mengandung biaya layanan unik.
- [ ] Bayar nominal tepat.
- [ ] Pastikan event masuk ke `PaymentNotificationEvent`.
- [ ] Pastikan payment dan order menjadi paid.
- [ ] Pastikan stok digital berbeda untuk concurrent order.
- [ ] Pastikan pesan produk dikirim ke chat pembeli.
- [ ] Matikan internet HP dan pastikan event masuk queue.
- [ ] Hidupkan internet dan pastikan queue ter-flush.
- [ ] Hentikan bridge lebih dari threshold test dan pastikan admin mendapat alert.

## 18. Source Reference

Implementasi utama:

```text
android/dana-notification-bridge/
src/server/payment/dana-notification-bridge-values.ts
src/server/payment/dana-notification-bridge.ts
src/server/payment/dana-bridge-status.ts
src/app/api/webhooks/dana-business/notification/route.ts
src/app/api/webhooks/dana-business/heartbeat/route.ts
src/server/telegram/checkout-flow.ts
src/server/telegram/admin-payment-confirm.ts
src/server/data/telegram-checkout-store.ts
src/server/data/telegram-notification-store.ts
src/server/data/digital-stock-store.ts
src/server/digital-stock/fulfillment.ts
prisma/schema.prisma
```
