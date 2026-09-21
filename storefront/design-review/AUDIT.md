# Audit desain BWR TELE

Sumber: https://chatgpt.com/c/6aa8ca5d-609c-83ec-aed5-c87756c90d8c

Berikut audit singkat yang saya sarankan, dengan tetap mempertahankan flow pembayaran dan struktur database yang sekarang.

Desktop katalog — rapikan hierarchy pencarian dan filter. Search utama, kategori, dan sorting sebaiknya terasa sebagai satu toolbar. Sidebar filter dibuat lebih compact dan sticky, sementara jumlah produk (44 produk) tetap dekat dengan area hasil. Hindari terlalu banyak kontrol pencarian yang terasa duplikat.

Desktop product card — prioritaskan informasi untuk keputusan beli. Urutan ideal: thumbnail → kategori/tag → nama produk → deskripsi pendek → harga → status stok → CTA. Badge stok seperti Stok 548 atau Tersisa 2 harus berasal dari backend, bukan nilai statis dari desain. Panjang judul/deskripsi perlu dibatasi agar tinggi card konsisten.

Mobile katalog — pertahankan 2 kolom, tapi sederhanakan kontrol. Header ringkas + bottom navigation sudah tepat. Filter status seperti Semua / Tersedia / Preorder / Habis cocok sebagai horizontal chips; kategori dan sorting cukup dropdown. Product card mobile harus mengutamakan gambar, nama, harga, dan stok karena ruang sangat terbatas.

Mobile checkout/invoice — pembayaran harus menjadi fokus utama. QRIS tetap pilihan pembayaran pertama. Untuk invoice Pending, panel QRIS ditampilkan di atas ringkasan invoice, lalu metode pembayaran lain seperti Saldo Refund. Setelah pembayaran terverifikasi, arahkan user mengambil produk dari halaman Pesanan; jangan menampilkan copy bahwa produk otomatis dikirim email.

Konsistensi design system. Pertahankan #1769FF, navy text, putih, border biru pucat, radius membulat, dot-pattern halus, dan karakter hoodie biru yang sama. Empty state, account, orders, katalog, cart, dan checkout sebaiknya memakai keluarga ilustrasi yang sama agar BWR TELE terasa sebagai satu produk, bukan kumpulan template berbeda.

Spesifikasi penggunaan aset ilustrasi

Aset karakter sebaiknya diperlakukan sebagai decorative/reusable illustration, bukan bagian dari data UI. Gunakan PNG transparan dengan rasio asli 3:2, width: 100%, height: auto, dan object-fit: contain. Jangan stretch atau menggunakan cover yang berpotensi memotong kepala, kaki, laptop, tanaman, atau floating cards.

Untuk desktop, aset paling cocok di hero/account area dengan lebar visual sekitar 420–620 px, tergantung container. Sisakan safe area sekitar 8–12% dari batas container. Untuk mobile, gunakan versi yang sama dalam ukuran lebih kecil atau crop komposisi secara terkontrol, tetapi tetap contain; jangan sampai ilustrasi mengambil ruang lebih besar daripada fungsi utama halaman.

Karakter, laptop, tanaman, paket, lock, dan check boleh tetap berada di file ilustrasi. Sebaliknya, judul, harga, status transaksi, nomor invoice, stock count, timer, QRIS, dan teks UI harus tetap berupa komponen HTML/data aplikasi, bukan ditanam ke gambar. Dot-pattern dan background biru pucat juga lebih baik dibuat lewat CSS supaya responsif.

Dan ya, semua angka/transaksi pada mockup sebelumnya adalah contoh desain saja. Total, stock count, status order, timer kedaluwarsa, nomor invoice, metode pembayaran yang tersedia, dan QR harus selalu memakai data backend/payment provider asli saat implementasi.

Khusus mockup tadi ada mismatch yang memang wajib diperbaiki saat implementasi: QR menampilkan Rp50.000, sementara total invoice menunjukkan Rp50.500. Nominal yang ditampilkan di panel QRIS harus sama persis dengan amount pembayaran aktual dari backend. Timer 23:59:12 juga hanya ilustrasi visual, bukan payment window asli; countdown harus dihitung dari expiry timestamp sebenarnya yang diberikan sistem pembayaran/backend.

QR di mockup juga hanya dummy/non-operasional. Jangan pernah menggunakan QR mockup sebagai QR pembayaran produksi.

Semua rekomendasi ini hanya menyentuh presentasi UI dan binding data ke UI—tidak perlu mengubah flow pembayaran maupun database yang sudah ada.