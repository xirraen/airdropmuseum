# Sprint 5 — Portfolio Intelligence, Export & Backup

## Basis, migrasi dan batasan

Basis: branch feat/sprint-4-quest-points (berasal dari feat/aggregator-core-2), **bukan main**. Migrasi 0005 menyediakan campaign, wallet watchlist, eligibility, claim checks, dan alert; 0008 menyediakan quest/progress/points ledger. Migrasi bernomor 0006 dan 0007 tidak ada di branch basis. Jangan mengasumsikan fitur atau data yang belum digabung telah tersedia.

Migrasi 0009_portfolio_intelligence.sql menambah user_portfolio_snapshots, portfolio_export_jobs, backup_metadata, user_campaign_subscriptions dan weekly_report_deliveries. Memperluas alert_preferences dengan weekly_enabled dan weekly_timezone. Tidak menyentuh data museum lama.

Tidak ada auto-claim, signing, approve, auto-complete sosial, private key, seed phrase, prediksi reward, expected value, atau saran finansial. Poin hanya metrik internal.

## API

Semua endpoint pengguna memerlukan header X-Telegram-Init-Data yang diverifikasi server; user_scope berasal dari identitas Telegram, bukan body/query pengguna.

| Metode | Endpoint | Fungsi |
| --- | --- | --- |
| GET | /api/aggregator/portfolio | Dashboard lengkap |
| GET | /api/aggregator/portfolio/summary | Summary, cache lima menit |
| GET | /api/aggregator/portfolio/deadlines | Deadline 7 hari |
| GET | /api/aggregator/portfolio/chain-exposure | Distribusi aktivitas wallet, bukan nilai aset |
| GET | /api/aggregator/portfolio/risk-review | Label Perlu ditinjau |
| GET/POST | /api/aggregator/portfolio/subscriptions | Campaign yang diikuti |
| DELETE | /api/aggregator/portfolio/subscriptions/:id | Hapus subscription |
| GET/PUT | /api/aggregator/portfolio/weekly-preferences | Zona waktu IANA dan opt-in mingguan |
| GET | /api/aggregator/export/markdown | Markdown |
| GET | /api/aggregator/export/csv | CSV |
| GET | /api/aggregator/export/json | JSON |
| POST | /api/aggregator/backup | Backup user baru |
| GET | /api/aggregator/backup/history | Riwayat user |
| GET | /api/aggregator/backup/:id | Unduh milik sendiri; server untuk admin |
| POST | /api/aggregator/restore | Restore merge atau replace |

Admin server backup menggunakan Authorization: Bearer AGGREGATOR_ADMIN_TOKEN. Pengguna biasa tidak dapat mengunduh backup server.

## Portfolio dan export

Ringkasan menghitung campaign diikuti/aktif, status todo/in_progress/submitted/verified/expired, total poin internal, wallet/chain, claimable yang menyertakan evidence HTTPS pada host resmi, deadline 7 hari, dan item manual. Aktivitas chain dihitung sebagai jumlah observasi protocol_activity terakhir per wallet (fallback satu wallet bila belum ada observasi). Label: Terkonsentrasi, Cukup seimbang, Tersebar. Risk review: sumber belum terverifikasi, KYC/geo tidak jelas, quest manual, dan claim page belum berbukti; semuanya berlabel Perlu ditinjau, tanpa menyimpulkan scam atau aman.

Export Markdown memuat summary, deadline, prioritas, eligibility progress, tinjauan risiko, sumber resmi. CSV berisi campaign, quest, status, chain, deadline, poin, wallet, URL evidence, catatan. Setiap CSV cell dikutip, dibatasi 4096 karakter, disanitasi dan diprefix apostrof bila dimulai karakter =, +, -, @ (termasuk sesudah whitespace). JSON export bukan format yang dapat dipulihkan. Format memakai MIME dan Content-Disposition attachment. Pagination limit maksimum 500, offset dan X-Next-Offset.

## Backup dan restore

Backup JSON schema_version 9 memuat created_at, user_scope, wallet_watchlist, campaign_subscriptions, quest_progress, points_ledger, alert_preferences dan evidence_refs. Disimpan sebagai objek R2 pada key acak yang mengandung UUID dua kali. Backend tidak mengekspor bot token, API key, session secret, private key atau seed phrase. Payload whitelist dibuat server, lalu ditandatangani HMAC SHA-256 dengan BACKUP_SIGNING_KEY (secret di Worker, tidak diekspor). Restore file tanpa signature valid, schema_version tidak cocok, ukuran lebih dari 512 KiB, atau user_scope berbeda akan ditolak.

Contoh body restore: JSON object dengan envelope (berisi payload serta signature) dan mode=merge. Alternatif: backup_id dan mode=merge. Mode replace membutuhkan confirm_scope sesuai akun yang terautentikasi dan confirm_phrase bernilai HAPUS DATA SAYA. UI juga meminta checkbox dan dialog persetujuan kedua. Pre-restore backup disimpan dahulu di R2, baru semua D1 writes dijalankan dengan batch transaksi. Ledger memakai INSERT OR IGNORE untuk tidak menggandakan poin pada pemulihan berulang. Data eligibility yang diarsipkan sebagai evidence tidak ditulis sebagai eligibility terverifikasi baru. Default merge tidak menghapus data. Ukuran maksimum 512 KiB; kapasitas dataset besar perlu pengujian D1 nyata.

## Scheduled backups & laporan

Cron yang sudah ada dijalankan setiap 15 menit. Setiap tanggal UTC sistem membuat satu backup server per user (backlog maksimum 20 user per cron), dengan retensi default 30 hari; object dan metadata expired dibersihkan. Hanya admin dapat mengunduh backup server. Backup user serta pre-restore juga mengikuti retensi 30 hari.

Laporan mingguan dikirim tiap Senin pukul 09:00 pada zona waktu IANA yang disimpan, atau UTC. Syarat: alert Telegram diaktifkan, weekly_enabled aktif dan pesan tidak kosong. Berisi verified quests 7 hari, pertambahan ledger, deadline 7 hari, campaign baru sesuai filter, item manual dan disclaimer verifikasi. weekly_report_deliveries mencegah duplikasi; retry failure dicatat.

## Konfigurasi dan deployment

1. Buat R2 bucket pada akun Cloudflare yang benar: npx wrangler r2 bucket create airdrop-museum-backups.
2. Simpan BACKUP_SIGNING_KEY dengan npx wrangler secret put BACKUP_SIGNING_KEY (acak minimal 32 byte), juga TELEGRAM_BOT_TOKEN serta AGGREGATOR_ADMIN_TOKEN.
3. Pastikan D1, Queue, Cron dan R2 binding pada wrangler.jsonc. Binding: DB (D1), AGGREGATOR_QUEUE (Queue), AGGREGATOR_BACKUP_BUCKET (R2), PUBLIC_APP_URL, AGGREGATOR_ALLOWED_HOSTS.
4. Backup data DB dahulu, lalu migrasi secara berurutan (0001–0005, 0008, 0009 pada branch ini). Audit gap 0006–0007 sebelum produksi; jangan membuat asumsi migrasi telah berjalan.
5. Jalankan npm ci, npm run build, npm test, npx wrangler d1 migrations apply airdrop-museum --remote, kemudian npx wrangler deploy. Jangan deploy bila test atau build gagal.
6. Buka /portfolio.html via Telegram Mini App, verifikasi 401/403, export, konfirmasi dua langkah, R2, Cron dan laporan mingguan.

## Pengujian & keterbatasan

tests/portfolio-intelligence.test.mjs memeriksa summary, chain distribution, deadline grouping, Markdown/JSON export, CSV escaping, oversized backup, schema mismatch, cross-user restore, laporan mingguan dan migrasi additive. Uji integrasi D1 nyata, idempotent restore isi nonkosong, R2, Telegram delivery, concurrency, dan dataset besar harus dilakukan sebelum aktif produksi. Test Node mock bukan bukti layanan eksternal aktif.
