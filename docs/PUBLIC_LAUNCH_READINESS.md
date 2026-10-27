# Current status — 0.7

This document retains the earlier pre-launch checklist below. Current implementation is described in `SERVER_CORE.md`, `UI_STRUCTURE.md`, and `XP_AND_REFERRALS.md`; those supersede earlier statements about absence of XP/server infrastructure. D1 is connected on C0. Local missions/XP/badges and a server referral-XP engine now exist. Public referral activation and cross-device synchronization still require the project Telegram bot secret/session and signed-in production verification. No wallet, real claim, public reviews, active paid bounty feed or crawler is enabled.

---

# Public launch readiness

Status ini menjelaskan kesiapan **kode** Airdrop Museum. Ini bukan bukti bahwa versi produksi sudah diterbitkan atau domain publik sudah diverifikasi.

## Sudah diperkuat

- Halaman Gallery memperingatkan bahwa exhibit demo adalah contoh fiktif, bukan kampanye airdrop nyata.
- Halaman My Pass menjelaskan data yang disimpan lokal, risiko browser/perangkat bersama, isi dan keamanan file backup, batas penghapusan, serta permintaan koneksi ke Telegram Web App SDK dan Google Fonts.
- Pengguna dapat menghapus seluruh data aplikasi dari browser dengan konfirmasi.
- UI museum kini memakai tema editorial responsif, label status yang lebih akurat, dan copy utama Bahasa Indonesia; catatan pengunjung tetap ditandai sebagai lokal/opini.
- Halaman Ajak menyediakan share/copy tautan kanonis secara sukarela; tidak ada kode/identitas referral, penghitung konversi, poin, atau hadiah.
- Worker menetapkan Content Security Policy, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, dan `Permissions-Policy`; kebijakan CSP membatasi skrip, font, gambar, koneksi, embedding, dan form ke sumber yang dibutuhkan aplikasi.
- Suite uji memeriksa header keamanan pada respons statis dan API.

## Batas produk yang wajib tetap terlihat

Enam exhibit bawaan adalah data demonstrasi fiktif. Katalog ini bukan feed airdrop aktif, rekomendasi investasi, atau verifikasi keamanan. Tidak ada akun, penyimpanan cloud, sinkronisasi antarperangkat, autentikasi Telegram terverifikasi, koneksi wallet, klaim hadiah, deteksi phishing otomatis, atau verifikasi eligibility. Catatan, review, status kampanye, tenggat, dan ledger pengguna tersimpan di localStorage browser ini; tidak disinkronkan. File ekspor backup berisi data pribadi tersebut dan perlu dilindungi.

## Sebelum mengumumkan rilis

1. Tentukan target publik yang tepat: hostname `workers.dev` atau custom domain. Cocokkan domain, route, account Cloudflare, dan otorisasi deployment; `wrangler.jsonc` saat ini mengaktifkan `workers_dev` dan memuat account ID tertentu, tetapi tidak menyatakan custom domain.
2. Pin versi Wrangler yang akan dipakai dan commit lockfile agar deployment dapat direproduksi; konfigurasi package saat ini belum mendeklarasikan Wrangler sebagai dependency.
3. Jalankan `npm test` dan `npm run build`, periksa diff hasil build, lalu lakukan deployment staging/preview pada akun dan hostname yang memang dimaksud.
4. Verifikasi origin HTTPS dari luar: `/`, `/api/health`, `/api/projects`, jenis konten, CSP/HSTS, asset, dan versi yang dilayani. Pastikan kebijakan CSP tidak mematahkan tampilan normal maupun alur Telegram Web App yang digunakan.
5. Lakukan smoke check di browser desktop, mobile, dan Telegram (jika dipromosikan sebagai Mini App); periksa konsol, keyboard/screen reader, ekspor/impor/hapus data, serta perilaku saat localStorage penuh/tidak tersedia.
6. Konfirmasikan bahwa domain menampilkan disclosure demo dan penyimpanan lokal sebelum promosi. Simpan prosedur rollback untuk deployment Cloudflare yang dipilih.

## Verifikasi lokal pada perubahan ini

- `npm test` — 21 tes lulus.
- `npm run build` — berhasil menghasilkan `src/worker.mjs` dari `dist/`.
- Smoke check browser lokal: beranda, dialog detail, halaman Ajak, dan aksi salin tautan; ini bukan pengujian mobile native atau Telegram.
- Deployment produksi, DNS/TLS live, dashboard Cloudflare, dan smoke test URL publik belum dilakukan.
