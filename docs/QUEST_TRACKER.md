# Sprint 4 — Quest & Points Tracker

Sprint 4 dibangun di atas Aggregator Core 2.0, branch feat/aggregator-core-2. Poin hanya indikator tracking internal, bukan saldo, token, nilai investasi atau jaminan reward. Tidak ada auto-complete sosial, on-chain signing, approve, claim ataupun transaksi.

**Disclaimer UI:** Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.

## Model data dan migrasi

Migrasi migrations/0008_quest_tracker.sql menambah campaign_quests, user_quest_progress, dan user_points_ledger. Relasi campaign → quest memakai foreign key CASCADE; progress → quest CASCADE. Ledger tetap append-only dan tidak memiliki foreign key ke quest, sehingga sejarah poin bertahan ketika data metadata berubah (penghapusan quest dengan ledger diblokir). Indeks utama: campaign_id, user_scope/status, user_scope/campaign_id. Indeks unik ekspresi pada COALESCE(wallet_address,'') menutup masalah duplikasi NULL pada SQLite.

Kolom baru rule_id menghubungkan quest wajib dengan eligibility rule resmi. Progress menggunakan revision untuk optimistic concurrency dan verification_source untuk audit jenis verifikasi. Semua updated_at/completed_at adalah Unix epoch dalam milidetik (Core 0005 memakai ISO 8601; jangan mencampurnya). Data pengguna dipisahkan dengan user_scope berupa tg:ID yang hanya dihasilkan dari verifikasi Telegram di backend, bukan body request.

**Prasyarat:** migrasi 0005_aggregator_core.sql sudah ada pada basis Aggregator Core. Pada saat branch Sprint 4 dibuat, berkas 0006_wallet_scan.sql dan 0007_monitor_alerts.sql belum tersedia di branch dasar. Jangan menganggap migrasi tersebut sudah diterapkan; periksa cabang integrasi sebelum produksi.

## Quest dan status

Tipe: social, testnet_task, mainnet_task, bridge, swap, liquidity, governance, referral, kyc, custom.

Verification method: manual, wallet_activity, url_submission, admin_review, none.

Status: todo, in_progress, submitted, verified, failed, expired, not_applicable.

Aturan manual/none:
- todo → in_progress, submitted, not_applicable
- in_progress → submitted, failed, not_applicable, todo
- submitted → todo, failed, not_applicable
- failed → todo, in_progress
- not_applicable → todo

URL submission wajib evidence HTTPS sebelum submitted. Hanya admin dapat memverifikasi submit tersebut; submit mandiri tidak menambah poin. Admin review menerima submitted/not_applicable dari user dan verified dari admin, setelah evidence valid. Wallet activity hanya dapat menjadi verified jika hasil eligibility_results milik wallet watchlist user memiliki rule_id cocok, status passed, waktu valid dan evidence HTTPS; endpoint tidak melakukan RPC baru atau transaksi. Social/KYC tidak diizinkan menggunakan wallet_activity. Tanpa bukti tetap manual_check, bukan eligible.

## Ledger poin dan reversal

Perubahan status menggunakan D1 prepared statements, parameter binding dan env.DB.batch() untuk status/ledger atomik. Update memakai revision agar update paralel tidak menimpa progress lain. Saat transisi sah ke verified, entri QUEST_VERIFIED dicatat. Total aktif untuk satu user_scope + quest_id dicek agar dua wallet tidak mengkredit poin ganda. Jika status verified menjadi failed, ditambahkan QUEST_REVERSAL negatif sebesar poin yang betul-betul dikreditkan. Tidak pernah menghapus ledger sebagai konsekuensi perubahan status. Jumlah poin, metode verifikasi dan rule_id quest tidak dapat diubah setelah ada sejarah ledger; penghapusan quest demikian juga ditolak.

Pengecualian adalah permintaan penghapusan data pribadi oleh pemilik melalui DELETE /api/aggregator/privacy; ini menghapus progress dan ledger user yang bersangkutan dan berbeda dengan reversal.

## Streak

Hitung tanggal lokal berdasarkan timezone IANA pada query tz, default UTC saat tidak tersedia/tidak valid. Setiap tanggal berturut-turut dengan quest yang masih verified memberi satu hari streak. Streak 0 apabila verifikasi terakhir lebih dari 48 jam. Sprint ini tidak menambah saluran alert, sehingga quiet hours dari sistem sebelumnya tidak berubah.

## Next Best Action

GET /api/aggregator/next-actions mengembalikan maksimal 100 quest yang belum verified, expired atau not_applicable, dengan deadline yang belum berlalu. Skor internal:

    priority = (deadline urgency * 3) + (quest weight * 2)
             + (points * 0.5) - (estimated effort * 1)
             - (estimated gas cost * 1)

Tenggat terdekat didahulukan, selanjutnya bobot, poin, effort, gas dan status campaign. Estimasi effort/gas adalah metadata campaign untuk perencanaan, bukan expected value. Grup: harus_segera (72 jam), minggu_ini (7 hari), bisa_menunggu (lainnya). Alasan rekomendasi selalu Bahasa Indonesia.

## Integrasi eligibility

Quest required=1 masuk ke progress campaign. Jika rule_id terhubung dengan rule registry dan progress verified memiliki verification_source admin_review/wallet_activity serta evidence, proyeksi rule quest terkait boleh ditandai passed. Jika bukti tidak valid, status tetap manual_check. Endpoint ini TIDAK mengubah eligibility_results atau mengklaim keseluruhan wallet eligible; aturan lain perlu evaluasi independen.

## Endpoint

| Method | Path | Izin |
| --- | --- | --- |
| GET | /api/aggregator/campaigns/:slug/quests | Publik; personal jika ada Telegram valid |
| POST | /api/aggregator/campaigns/:id/quests | Admin Bearer |
| PUT / DELETE | /api/aggregator/quests/:id | Admin Bearer |
| GET | /api/aggregator/quests/my | Telegram terverifikasi; pagination quest dan ledger |
| POST / PUT | /api/aggregator/quests/:id/progress | User scope sendiri; admin dapat review scope bertujuan |
| POST | /api/aggregator/quests/:id/evidence | Telegram; khusus URL submission |
| GET | /api/aggregator/campaigns/:slug/progress | Telegram |
| GET | /api/aggregator/next-actions | Telegram |
| GET | /api/aggregator/points | Telegram; page/limit/tz |

Pagination quest dan ledger memakai page/limit, maksimum 100 item per page. Semua output JSON no-store; frontend meng-escape HTML. URL wajib HTTPS dan bukan IP/localhost/host internal; official_url harus sesuai origin URL resmi campaign. Field dibatasi: title 160, description 2000, note 1000, URL 2048. Input yang terdeteksi sebagai private key, mnemonic atau signature ditolak. Pengguna tidak dapat menetapkan verified sendiri.

## UI

Pada detail campaign tersedia tab Quest, progress bar required quest, badge Draft lokal, Menunggu verifikasi, Terverifikasi, Kedaluwarsa, status, poin, deadline, evidence URL serta tautan resmi. Tanpa Telegram, draft disimpan di localStorage dan tidak mengkredit poin. Halaman Next Best Action menampilkan rekomendasi dan, untuk Telegram terverifikasi, ringkasan poin dan streak.

## Uji

Jalankan npm ci, npm run build, lalu npm test. Test baru ada pada tests/quest-sprint4.test.mjs. Workflow .github/workflows/sprint4-ci.yml menjalankan perintah yang sama. Liputan: migrasi kompatibel, admin/nonadmin, URL/enum, transisi, bukti wallet, poin sekali, reversal, streak, sortir/pruning, scope, pagination dan escaping. Kesuksesan belum boleh diklaim tanpa hasil workflow.

## Deployment

1. Review dan gabungkan dahulu Aggregator Core 2.0 (PR #1) ke target yang benar. Jangan deploy Sprint 4 ke main versi 1.2 tanpa basis itu.
2. Ekspor backup D1: npx wrangler d1 export airdrop-museum --remote --output /secure/backup-before-quest.sql.
3. Review urutan migrasi, khususnya jika 0006 atau 0007 masuk dari cabang lain. Jalankan npx wrangler d1 migrations apply airdrop-museum --remote.
4. Konfigurasi TELEGRAM_BOT_TOKEN dan AGGREGATOR_ADMIN_TOKEN sebagai Worker secrets; DB harus terikat ke D1 yang benar.
5. Jalankan npm ci, npm run build, npm test, lalu npx wrangler deploy setelah CI hijau. Smoke-test owner isolation, status 403 non-admin, ledger/reversal, UI mobile, dan Next Best Action.

## Rollback dan risiko

Rollback aplikasi: hentikan penulis dan deploy Worker sebelumnya tanpa menghapus tabel, agar tidak kehilangan ledger. Rollback schema jika benar-benar perlu: backup, hentikan semua writer, hapus user_points_ledger, user_quest_progress, campaign_quests berurutan, kemudian perbarui catatan version 8 pada am_core_schema dan migration ledger D1. Rollback schema destruktif, bukan prosedur default.

Risiko mitigasi: duplikasi reward internal, batas antar-user, XSS, SSRF URL, manipulasi status, kekeliruan eligibility, race status, secret leakage dan klaim keuntungan. Tetap perlu konfigurasi operator untuk token Telegram/admin, sumber resmi, review manual dan indexer historis; alamat wallet publik sendiri bukan bukti kepemilikan.
