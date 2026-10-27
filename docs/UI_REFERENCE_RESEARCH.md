# Catatan Riset UI: Referensi untuk Implementasi Airdrop Museum

## Tujuan dan batasan

Catatan ini merangkum pola antarmuka yang teramati pada empat situs referensi untuk membantu implementasi UI Airdrop Museum. Fakta tentang situs referensi ditandai dengan sitasi bernomor. Rekomendasi desain merupakan sintesis untuk brief Museum, bukan klaim tentang fitur yang telah ada.

Brief produk yang diberikan menetapkan Museum sebagai galeri historis berbasis bukti yang menampilkan semua airdrop terdaftar tanpa penyaringan editorial, dengan hasil historis, bidang data transparan, dan suara pengunjung terbuka. Implementasi saat ini bersifat local-first pada Cloudflare Worker, memakai demo fiktif, dan tidak memiliki backend, autentikasi, atau verifikasi data live. Roadmap whitepaper bergerak dari manual/testnet menuju crawler/trust, on-chain/security, lalu community/multichain. Pernyataan tentang kondisi produk dan roadmap dalam paragraf ini berasal dari brief, bukan hasil verifikasi situs eksternal.

## Temuan yang diamati

Ethos menyusun pengenalan produknya di sekitar ulasan, vouch, dan slash sebagai sinyal reputasi; dokumentasi ulasan menjelaskan rating positif/netral/negatif beserta komentar, sedangkan mekanisme lain bergantung pada stake, profil, atau voting. Halaman tersebut menjelaskan mekanisme Ethos, bukan bukti bahwa semua alur sedang aktif, dan bukan dasar untuk menerapkan skor reputasi serupa di Museum. [1] [2] [3] [4]

Airdrops.io menampilkan direktori berorientasi partisipasi dengan status, ringkasan tindakan, tautan klaim, filter/sortir, serta halaman detail yang mengelompokkan rincian distribusi, instruksi, FAQ, berbagi, dan pelaporan isu. Situs juga menyediakan panduan keselamatan tersendiri. Klaim verifikasi tim dan isi listing adalah pernyataan situs; audit ini tidak menguji ketepatan data atau metodologi verifikasinya. [5] [6] [7] [8]

CoinDropster menampilkan katalog berhalaman dengan kategori, deskripsi, status dan jenis reward, lalu halaman proyek dengan tanggal pembaruan, tautan keluar, checklist, dan fakta kunci. FAQ dan kebijakan privasinya menerangkan kebutuhan akun/sinkronisasi yang diklaim untuk fitur tertentu. Klaim update harian, verifikasi, funding, dan fitur akun tidak diverifikasi secara independen. [9] [10] [11] [12] [13]

AirdropMeta memisahkan jalur browse berdasarkan chain/kategori serta membedakan airdrop aktif dan distribusi lampau pada halaman kategori yang diperiksa. Beranda menampilkan dimensi scan seperti status, tugas, rating, difficulty, dan potential tier; halaman panduan menghubungkan direktori dengan materi edukasi. Label seperti “verified”, rating, atau tier merupakan taksonomi/klaim situs, bukan fakta yang tervalidasi oleh audit ini. [14] [15] [16]

## Sintesis untuk Museum: pola yang dapat diadaptasi

Pola yang paling relevan lintas referensi adalah hirarki dari direktori ringkas ke halaman detail, pengelompokan bidang yang konsisten, pemisahan status/lifecycle, serta akses yang jelas ke panduan atau penjelasan metodologi. Adaptasi sebaiknya memakai tata informasi dan keterbacaan saja—bukan nama, identitas visual, aset, komposisi khas, atau copy milik situs referensi.

Untuk museum berbasis bukti, jangan menyamakan popularitas, rating, klaim verifikasi, pendapat pengunjung, dan temuan faktual. Setiap jenis informasi perlu label dan sumbernya sendiri; ketidakpastian harus terlihat, bukan dilebur menjadi skor kepercayaan yang tidak terjelaskan. Airdrop Museum juga tidak seharusnya menyalin pola CTA “claim”, farming, wallet-connect, atau penyaringan peluang aktif karena brief meminta galeri historis yang tidak menyembunyikan exhibit positif maupun negatif.

## Prioritas UI yang dapat dilakukan sekarang

1. **Kartu katalog dan detail exhibit yang konsisten.** Tampilkan semua demo/entri yang tersedia tanpa menyembunyikan hasil positif, negatif, scam, atau belum diketahui. Gunakan ringkasan yang mudah dipindai dan tautkan ke detail. Ini mengadaptasi pola direktori-ke-detail yang tampak pada Airdrops.io, CoinDropster, dan AirdropMeta, tetapi mempertahankan cakupan tak-terfilter sesuai brief. [5] [7] [9] [10] [14] [16]
2. **Kelompok bidang transparan dengan provenance.** Pada halaman detail, pisahkan fakta deskriptif, hasil historis, interpretasi, dan suara pengunjung; sediakan label sumber/tanggal atau “tidak diketahui” hanya bila data itu tersedia dalam demo. Pola rincian berlabel terlihat pada halaman detail Airdrops.io dan CoinDropster; rekomendasi provenance ini adalah prinsip desain Museum, bukan fitur yang diklaim telah ada di situs tersebut. [7] [11]
3. **Status dan lifecycle yang eksplisit, tanpa ranking keamanan.** Buat label status/outcome yang netral dan keterangan historis agar “lampau”, “berhasil”, “gagal”, “dituduh”, dan “belum terverifikasi” tidak dipertukarkan. AirdropMeta secara teramati memisahkan konten aktif dan lampau; Museum dapat mengadaptasi pemisahan temporal tanpa mengambil label editorial “verified”, “trending”, atau “potential tier”. [14] [16]
4. **Panel suara pengunjung dengan konteks keterbatasan.** Pertahankan tampilan ulasan lokal yang sudah ada sebagai opini, bukan fakta terverifikasi; bedakan sentimen positif/negatif dan komentar dari bukti arsip. Ethos mendokumentasikan ulasan bertanda identitas dan profil, tetapi kebutuhan itu tidak cocok untuk disalin ke demo lokal tanpa autentikasi. [3]
5. **Penjelasan metodologi dan keselamatan yang mudah ditemukan.** Tambahkan bagian statis “cara membaca exhibit”, batas data demo, dan panduan keselamatan kontekstual; jangan menyatakan investigasi live, verifikasi on-chain, atau moderasi yang belum tersedia. Airdrops.io memisahkan panduan keselamatan, sementara AirdropMeta menghubungkan direktori dan panduan edukatif. [8] [15]
6. **Navigasi arsip/browse yang sederhana.** Gunakan kategori atau chain hanya sebagai navigasi atas data demo yang memang tersedia, tanpa mengimplikasikan filter dinamis atau cakupan data nyata. Pola browse kategori dan chain terlihat pada AirdropMeta; kontrol filter yang teramati di situs referensi tidak membuktikan implementasi serupa di Museum. [6] [14] [16]

Prioritas di atas tidak memerlukan penambahan autentikasi, konten live palsu, transaksi token/wallet, atau skor trust yang tidak dapat diverifikasi. Jangan menyajikan crawler, verifikasi on-chain/security, sinkronisasi komunitas, alerts, atau multichain sebagai kemampuan sekarang: semua itu bergantung pada fase roadmap berikutnya, sumber data yang dapat diaudit, dan—untuk kontribusi komunitas—kebijakan moderasi serta penanganan penyalahgunaan. Waktu dan desain implementasi roadmap tidak dapat dipastikan lebih jauh dari brief yang tersedia.

## Referensi

[1]: https://www.ethos.network/ "Ethos Network — Reputation & Credibility, Onchain"

[2]: https://whitepaper.ethos.network/ethos-mechanisms/vouch "Vouch"

[3]: https://whitepaper.ethos.network/ethos-mechanisms/review "Review"

[4]: https://whitepaper.ethos.network/ethos-mechanisms/slash "Slash"

[5]: https://airdrops.io/ "Crypto Airdrops, verified daily since 2017"

[6]: https://airdrops.io/latest/ "Latest Airdrops"

[7]: https://airdrops.io/opengradient/ "OpenGradient"

[8]: https://airdrops.io/stay-safe/ "Stay safe!"

[9]: https://coindropster.com/ "CoinDropster: Crypto Airdrop Tracker, Checklists & Farming Tool"

[10]: https://coindropster.com/airdrops "Live airdrops tracked in CoinDropster"

[11]: https://coindropster.com/airdrop/voyage-activity966 "Voyage Airdrop: tasks and status"

[12]: https://coindropster.com/faq "Frequently asked questions"

[13]: https://coindropster.com/policy "Privacy Policy"

[14]: https://www.airdropmeta.com/ "Best Crypto Airdrops 2026: Live List | Airdrop Meta"

[15]: https://www.airdropmeta.com/guides "Crypto Airdrop Guides"

[16]: https://www.airdropmeta.com/analytics-airdrops "Analytics Airdrops"
