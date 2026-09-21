# Setup domain, HTTPS, dan login

## Freestyle dengan domain yang sudah terdaftar

Sesudah `deploy.py status` menunjukkan `healthy`, arahkan rule TLS yang sudah ada ke VM baru. Perintah berikut memakai placeholder; jangan membuat rule duplikat.

```powershell
npx freestyle@latest tls update TLS_RULE_ID --domain store.example.com --from public --to vm=VM_ID,port=3000 --team ACCOUNT_ID --output json
```

Untuk domain baru, tambahkan domain melalui dashboard Freestyle, salin persis record verifikasi TXT dan delegasi ACME yang ditampilkan, lalu jalankan verifikasi. Jangan memakai challenge TXT domain lain. CNAME hostname storefront mengikuti target yang ditampilkan Freestyle. Pertahankan MX dan record email domain utama.

## VPS biasa

Arahkan DNS A subdomain ke IPv4 VPS; hanya tambahkan AAAA jika IPv6 benar-benar dikonfigurasi. Pasang Caddy pada host dan gunakan konfigurasi berikut, mengganti domain:

```caddyfile
store.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Izinkan port 80/443 untuk Caddy. Batasi akses publik port 3000 melalui firewall VPS/security group karena TLS ditangani Caddy. Validasi konfigurasi Caddy sebelum reload. Jangan mengalihkan domain sebelum candidate sehat.

## Clerk dan API toko

1. Gunakan instance Clerk production untuk domain production.
2. Tambahkan CNAME frontend API, accounts, dan email/DKIM sesuai dashboard Clerk. Nilainya spesifik instance, bukan nilai contoh.
3. Aktifkan email/password dan verifikasi email. Nonaktifkan phone number untuk sign-in/sign-up. Jangan mengubah faktor autentikasi akun lama tanpa evaluasi terpisah.
4. Isi `APP_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` pada file env privat frontend. Public key masuk saat build; perubahan key memerlukan build ulang.
5. Backend harus memverifikasi issuer Clerk serta authorized parties yang tepat. Tambahkan domain baru sesuai runbook backend; jangan memakai wildcard origin.
6. Gunakan key ID dan shared secret API storefront yang berpasangan dengan backend. Rotasi dilakukan sebagai pekerjaan terpisah: siapkan pasangan baru, deploy kedua sisi dengan periode transisi jika didukung, verifikasi request bertanda tangan, baru cabut key lama. Jangan mengganti hanya satu sisi.
7. Periksa `/api/health`, `/shop`, `/sign-in`, `/sign-up`, `/cart`, login email, serta tampilan mobile. Verifikasi pembayaran nyata harus membedakan invoice dibuat, pembayaran diterima, dan produk terkirim.

Jangan menaruh token, password, OTP, atau isi file env pada dokumentasi. Setelah verifikasi, hapus salinan staging lokal yang tidak diperlukan. Environment runtime tetap disimpan privat di VM.
