# Analisis `npm audit`: temuan high

**Snapshot yang dianalisis:** repository Airdrop Museum `main` pada commit `12f5abf`, lockfile yang ada pada 28 Oktober 2026. Perintah `npm audit --audit-level=high` menghasilkan **11 high severity vulnerability findings**. Ini bukan 11 CVE/advisory yang berbeda: output audit saat ini menunjuk satu advisory unik, GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 pada Zod, lalu menghitung paket-paket yang bergantung pada versi Zod terdampak. [1]

## Akar masalah dan jalur dependency

Advisory tersebut menjelaskan resource exhaustion/denial of service saat Zod memvalidasi array besar dengan elemen invalid dan menghasilkan issue untuk tiap elemen. GitHub Advisory Database menyebut versi `<4.6.6` terdampak dan `4.6.6` sebagai versi patched; advisory memberi severity High, CVSS 4.0 8.2. [1]

Aplikasi mendeklarasikan `@walletconnect/ethereum-provider@^2.26.0` secara langsung di `package.json`. Lockfile saat audit mengunci `2.26.0`, yang membawa `@reown/appkit@1.8.19`. Di jalur itu ditemukan antara lain `@reown/appkit-wallet@1.8.19` dengan Zod 3.22.4, serta `@coinbase/cdp-sdk@1.60.0` melalui `@base-org/account`, dengan Zod 3.25.76 dan `abitype@1.0.6`. Instalasi Zod v3 itu berada di bawah rentang `<4.6.6` menurut metadata advisory yang digunakan `npm audit`. `viem` sendiri tampak memakai Zod 3.25.76 dan `abitype@1.2.3`, tetapi bukan jalur yang ditunjuk sebagai vulnerable oleh output audit ini.

Dengan demikian, perbaikan perlu menargetkan dependency tree WalletConnect/Reown dan dependency Zod transitif yang ditandai audit. Mengubah hanya satu package lain atau mengedit `package-lock.json` secara manual tidak memperbaiki akar graph.

## Dampak dan batas kepastian

Jenis dampaknya adalah **availability**: proses yang melakukan parse terhadap input penyerang dapat memakai memori berlebihan atau crash. Keterjangkauan praktis bergantung pada apakah aplikasi/dependency benar-benar memvalidasi input yang dapat dikontrol penyerang memakai schema terkait, serta apakah ukuran input dibatasi sebelum parsing. NVD menguraikan skenario array/set/map tanpa batas ukuran dan mengatakan perubahan upstream yang pertama dirilis pada 4.6.6 hanya memeriksa `.max()`, `.length()` dan `.size()` sebelum parsing; schema tanpa batas tetap tidak terlindungi. [2]

Repo membundel `@walletconnect/ethereum-provider` ke `dist/walletconnect-bundle.js` melalui `scripts/build-worker.mjs`, dan UI memakai adapter tersebut. Ini membuat package ikut terdistribusi ke browser. Namun, temuan dependency saja tidak membuktikan adanya jalur eksploit yang bisa dipicu dari luar, atau bahwa Worker server menerima input Zod tersebut. Perlakukan sebagai **risiko nyata yang perlu ditangani**, bukan bukti bahwa eksploitasi sudah terjadi.

## Nuansa advisory dan versi patch

Ada perbedaan material antar-sumber. GHSA menandai `<4.6.6` sebagai terdampak dan 4.6.6 patched. Akan tetapi, PR upstream yang dirujuk hanya memindahkan pengecekan batas ukuran ke sebelum parsing untuk container yang memiliki batas eksplisit; PR itu menyatakan container tanpa batas tidak berubah. [1] [3] NVD juga mencatat bahwa kasus unbounded masih terdampak dan mencantumkan Zod `<=4.6.7` sebagai affected dalam data yang dipublikasikan saat ini. [2]

Selain itu, issue upstream untuk Zod v3 menyebut v3 masih mem-parsing semua elemen meskipun `.max()` telah ditentukan, dan maintainer menyatakan tidak ada lagi rilis baru v3. Pada 24 Oktober, komentar issue juga memperingatkan bahwa `zod/v3` yang disertakan dalam rilis Zod v4 masih memakai implementasi v3 yang sama. [4] Jadi, “paksa semua dependency ke Zod 4.6.6+” **belum dapat dianggap sebagai penutupan tuntas** untuk semua schema dan pemakai v3.

`npm audit` menyarankan `npm audit fix --force`, yang akan menurunkan `@walletconnect/ethereum-provider` ke `2.19.4` dan menandainya sebagai breaking change. Itu bukan rekomendasi aman untuk dijalankan membabi buta: paket tersebut berada jauh di bawah versi terkunci 2.26.0, bergeser dari lini dependency Reown AppKit ke WalletConnect Modal, dan dapat mengubah API, kompatibilitas serta perilaku koneksi wallet. Reown mendokumentasikan Ethereum Provider sebagai package yang digunakan untuk integrasi WalletConnect v2; perubahan versi perlu diuji terhadap implementasi aktual. [5]

## Rekomendasi perbaikan

### 1. Jangan jalankan `npm audit fix --force` langsung

Jangan menerima downgrade mayor/transitif itu hanya agar hitungan audit menjadi nol. Pertahankan lockfile saat ini sampai jalur upgrade yang kompatibel diuji pada branch terpisah. Jangan mengedit lockfile manual.

### 2. Cari rilis upstream yang memperbarui graph tanpa downgrade provider

Periksa rilis terbaru yang kompatibel dari `@walletconnect/ethereum-provider`, Reown AppKit, dan dependency yang membawa Zod. Upgrade provider pada major/minor yang didukung secara sengaja, regenerasi lockfile dengan npm, lalu periksa `npm ls zod` dan `npm audit --json`. Pastikan upgrade benar-benar menghilangkan Zod v3 yang ditandai; hanya menaikkan provider tanpa mengecek tree belum cukup. Jika belum ada rilis kompatibel, laporkan kepada maintainer paket dan tetapkan exception sementara yang memiliki pemilik/tanggal tinjau.

### 3. Hindari override lintas major tanpa uji kompatibilitas

Jangan menambahkan `overrides: { "zod": "^4..." }` secara umum sebagai fix cepat. Dependency yang mengharapkan Zod 3 dapat bergantung pada API dan tipe versi itu; alias `zod/v3` dapat mempertahankan jalur implementasi lama. Overrides baru layak setelah audit `npm ls`, pemeriksaan imports/exports, test integrasi dan bukti build/runtime. Bahkan jika audit menyatakan patched, sisa risiko unbounded harus ditangani terpisah.

### 4. Terapkan mitigasi DoS pada boundary

Untuk input yang dapat dikirim user atau provider eksternal, batasi ukuran HTTP/body, kedalaman/nilai array sebelum validasi, timeout dan concurrency. Hindari schema array/set/map tanpa maksimum pada request yang tidak tepercaya. Untuk array bounded, validasi batas sebelum memproses tiap elemen dan batasi jumlah issue yang dikumpulkan; pertimbangkan validator/guard yang melakukan reject awal. Ini mitigasi aplikasi, bukan pengganti upgrade dependency. Jangan membatasi ukuran payload browser saja jika Worker/API juga menerima input.

### 5. Verifikasi ulang sebagai gate merge

Setelah perubahan, jalankan `npm ci`, `npm audit --audit-level=high`, `npm ls zod @walletconnect/ethereum-provider @reown/appkit @coinbase/cdp-sdk`, `npm test`, dan `npm run build`. Periksa diff lockfile, ukuran bundle, wallet connect/disconnect, event account/chain, error provider, serta login/signature flow terkait. Kriteria penerimaan: advisory tidak lagi muncul atau exception terdokumentasi; tidak ada Zod v3 unreviewed pada input tidak tepercaya; test/build lulus; versi dependency dan evidence ditulis di PR.

**Prioritas:** high untuk diselesaikan sebelum public launch, terutama karena bundle mencakup kode WalletConnect dan error-nya berpotensi mengganggu availability. Untuk lingkungan saat ini, tidak ada bukti exploit atau outage; kedekatan risiko perlu dinilai setelah jalur input aktual di-trace dan provider diperbarui.

## Referensi

[1]: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5 "GitHub Advisory Database GHSA-mrhx-c7xc-m3w5"
[2]: https://nvd.nist.gov/vuln/detail/CVE-2023-54404 "NIST National Vulnerability Database CVE-2023-54404"
[3]: https://github.com/colinhacks/zod/pull/6652 "Zod pull request 6652 for bounded container checks"
[4]: https://github.com/colinhacks/zod/issues/6653 "Zod issue 6653 concerning v3 array bounds"
[5]: https://docs.reown.com/advanced/providers/ethereum "Reown Ethereum Provider documentation"


## Hasil eksperimen remediation di branch terisolasi

Pada 28 Oktober 2026, dua kandidat dicoba tanpa deployment:

- **Downgrade provider ke `2.19.4`** (versi yang ditawarkan pesan `npm audit fix --force`) mempertahankan seluruh 85 test aplikasi lulus, tetapi tidak menyelesaikan advisory. Audit setelah downgrade menunjukkan **4 high + 7 moderate**; Zod masih terpasang sebagai `3.25.76`, serta graph lama membawa advisories `ws` dan `decode-uri-component`. npm juga menandai provider/modal/sign-client/universal-provider versi tersebut deprecated. Kandidat ini ditolak dan tidak di-commit.
- **Override semua Zod ke `4.6.7`** membuat `npm audit` melaporkan nol temuan; `npm test` lulus 85/85 dan `npm run build` berhasil. Namun, ini hanya menyelesaikan hasil scanner berdasarkan rentang GHSA. NVD menyebut case array/set/map tanpa batas ukuran masih terdampak sampai versi yang lebih baru, dan file Reown `@reown/appkit-wallet@1.8.19` (`W3mFrameSchema.js`) memuat beberapa schema array tanpa `.max()`, termasuk `resources`, `icons`, RPC `params`, `calls`, dan `transactions`. Package tersebut meminta Zod 3.22.4, sehingga force override menukar dependency yang diminta tanpa upstream compatibility assurance. Tidak tersedia test end-to-end wallet dengan project ID/provider staging di audit ini. Kandidat ini juga ditolak sebagai fix produksi; perubahan override dibuang.

### Status akhir eksperimen

`package.json` dan `package-lock.json` dipulihkan persis ke baseline. Setelah pemulihan: `npm test` **85/85 pass**, `npm run build` berhasil, dan `npm audit` kembali melaporkan **11 high** pada baseline. Working tree hanya memiliki dokumen audit/rencana yang belum dikomit; tidak ada perubahan dependency atau deployment yang dilakukan.

### Keputusan keamanan

Belum ada fix dependency yang terbukti sekaligus menghilangkan seluruh risiko dan menjaga integrasi wallet. Tindakan lanjut yang aman: minta upstream Reown/WalletConnect merilis graph Zod yang diperbarui dan membatasi collection pada schema frame/protocol; lalu upgrade pada branch dan jalankan E2E staging (connect, cancel, disconnect, accounts/chain changes, signature login, wallet frame/RPC payload size). Sampai syarat itu terpenuhi, biarkan advisory terbuka. Jangan menurunkan provider atau memaksa override Zod ke produksi hanya demi angka audit nol.
