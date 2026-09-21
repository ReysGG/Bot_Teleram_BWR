# Template deployment storefront

Build berlangsung di VM Linux yang memiliki Docker dan Python 3.12+. Workstation hanya memerlukan Python dan SSH/SCP, atau Node/npx untuk Freestyle. Tidak menjalankan migrasi, mengubah database, mengatur DNS, atau merotasi API key.

## Konfigurasi

Jalankan dari root repository:

```powershell
python deploy/template/deploy.py init
python deploy/template/deploy.py set --key host --value ubuntu@IP_VPS
python deploy/template/deploy.py set --key identity --value C:/Users/USER/.ssh/id_ed25519
python deploy/template/deploy.py set --key remote_dir --value /home/ubuntu/storefront
python deploy/template/deploy.py set --key domain --value store.example.com
python deploy/template/deploy.py plan
```

Untuk Freestyle, ganti transport dan ID:

```powershell
python deploy/template/deploy.py set --key transport --value freestyle
python deploy/template/deploy.py set --key vm --value vm-ID
python deploy/template/deploy.py set --key team --value acct-ID
```

Salin `storefront/.env.example` ke file privat `.env.production.local`, isi konfigurasi frontend dan API toko yang sudah tersedia. Gunakan Clerk production untuk domain production. Jangan masukkan kredensial bot/database backend ke frontend. Ubah `APP_URL` jika domain berubah, serta authorized parties Clerk di backend sesuai domain yang dituju.

## Deploy / update

```powershell
python deploy/template/deploy.py deploy --env-file storefront/.env.production.local
python deploy/template/deploy.py status
# Update kode berikutnya memakai env yang sudah tersimpan di VM:
python deploy/template/deploy.py deploy
```

Perintah deploy memulai pekerjaan di latar belakang. Gunakan `status` sampai status `healthy`; status `building` belum berarti deployment selesai. Log lengkap berada pada `deployment.log` di direktori runtime VM. Setting `domain` mengganti `APP_URL` runtime; domain kosong mempertahankan nilai dari env. DNS/TLS/Clerk tetap mengikuti [panduan domain](DOMAIN_SETUP.md).

Source dikirim dengan daftar file yang diizinkan; `.env`, `node_modules`, dan `.next` tidak masuk image build. File environment terpisah disimpan di direktori privat. Build Docker menjalankan typecheck, lint, tes frontend, dan Next build. Candidate harus healthy sebelum aplikasi lama dihentikan. Kegagalan health setelah penggantian otomatis mengembalikan container sebelumnya.

Container `storefront-template` membuka port 3000. Atur HTTPS/reverse proxy atau Freestyle TLS ke port ini setelah health dan domain login terverifikasi. Template tidak memasang TLS otomatis. Gunakan satu deployment pada satu waktu; container lama dan image disimpan untuk rollback manual dan perlu dibersihkan secara terencana jika disk penuh.

## Pemeriksaan dan rollback manual di VM

```bash
docker logs --tail 80 storefront-template
cat /home/ubuntu/storefront/current.json
```

`previous` pada `current.json` berisi nama container terakhir. Untuk rollback, hentikan dan rename container aktif, rename container `previous` menjadi `storefront-template`, lalu start. Container lama mempertahankan environment versinya sendiri. Jangan hapus container aktif atau previous sebelum memastikan hasil deployment.

Template ini khusus frontend yang terpisah dari Telegram backend. Deployment backend mengikuti runbook production dan bukan bagian perintah ini.
