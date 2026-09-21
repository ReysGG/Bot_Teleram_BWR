# K12 Stockroom Bridge

Aplikasi Android khusus toko K12 Stockroom yang meneruskan notifikasi transaksi
masuk dari DANA, DANA Bisnis, atau Bank Jago ke backend independen toko.

Project ini adalah salinan yang sudah dipisahkan dari BuildWithReys:

- package: `com.k12stockroom.danabridge`
- app name: `K12 Stockroom Bridge`
- endpoint default: `https://70-153-137-10.sslip.io/api/bridge/android/notification`
- APK output: `K12-Stockroom-Bridge.apk`

Jangan memakai secret dari toko lama. Buat `DANA_ANDROID_BRIDGE_SECRET` baru
minimal 32 karakter di server, lalu masukkan nilai yang sama melalui layar
aplikasi. Secret tidak ditanam di APK dan disimpan terenkripsi memakai Android
Keystore.

## Server

Backend menyediakan endpoint berikut:

```text
POST /api/bridge/android/notification
POST /api/bridge/android/heartbeat
```

Aktifkan hanya untuk perangkat dan akun merchant yang khusus toko ini:

```env
DANA_ANDROID_BRIDGE_ENABLED=true
DANA_ANDROID_BRIDGE_SECRET="buat-secret-baru-minimal-32-karakter"
```

Server menerima package `id.dana`, `id.dana.kasir`, dan
`com.jago.digitalBanking`. Untuk Bank Jago, Android hanya meneruskan pola
transfer masuk seperti `<pengirim> telah mengirim Rp25.000 ke kamu`,
`Kamu menerima kiriman Rp25.000 dari <pengirim>`, dan
`Kamu menerima Rp25.000 dari GoPay`; notifikasi transfer keluar, refund,
cashback, voucher, dan promo diabaikan. Pembayaran baru
dikonfirmasi jika notifikasi berisi satu nominal Rupiah dan tepat satu invoice
pending cocok dengan nominal serta jendela waktunya. Event tidak cocok atau
ambigu tidak mengubah pembayaran.

Jika akun merchant yang sama masih dipakai toko lain, jangan aktifkan direct
bridge ini. Gunakan neutral relay/global payment registry agar satu notifikasi
hanya dapat dimiliki satu toko.

## Setup HP

1. Install `K12-Stockroom-Bridge.apk` lalu buka aplikasinya.
2. Pastikan endpoint default mengarah ke website K12 Stockroom.
3. Masukkan secret baru yang sama dengan server dan simpan.
4. Izinkan restricted settings jika Android memblokir notification access.
5. Aktifkan notification access untuk K12 Stockroom Bridge.
6. Hubungkan ulang listener dan pastikan statusnya terhubung.
7. Matikan battery optimization untuk bridge, aplikasi DANA, dan aplikasi Jago.
8. Aktifkan autostart/auto-launch pada Xiaomi, Oppo, Vivo, atau Realme.
9. Tekan uji koneksi dan pastikan server merespons HTTP 200.
10. Pastikan antrean kembali ke 0 setelah event terkirim.

HP sebaiknya selalu terhubung charger dan internet. Event gagal kirim disimpan
di antrean persisten, lalu dicoba ulang oleh foreground service dan watchdog.

## Build

Gunakan JDK bawaan Android Studio:

```powershell
$env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
.\gradlew.bat assembleDebug
```

APK berada di:

```text
app/build/outputs/apk/debug/K12-Stockroom-Bridge.apk
```
