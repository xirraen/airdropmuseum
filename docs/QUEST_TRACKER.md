# Sprint 4 — Quest & Points Tracker

## Ruang lingkup
Sprint 4 menambah quest, poin internal, streak harian, progress campaign, dan Next Best Action pada Aggregator Core 2.0 (Cloudflare Workers + D1). Branch: `feat/sprint-4-quest-points`, dibuat dari `feat/aggregator-core-2`. Migrasi 0008 bergantung pada tabel `campaigns`, `eligibility_results`, `wallet_watchlist` dari migrasi 0005. Migrasi 0006–0007 belum ditemukan pada branch sumber ketika sprint disusun: jangan menganggap Sprint 2/3 siap produksi.

## Model data
| Tabel | Keterangan |
|---|---|
| `campaign_quests` | Quest per campaign, jenis/metode, poin, bobot, batas tanggal, `required`, URL resmi, timestamps. |
| `user_quest_progress` | Status, evidence, note, `updated_at`, `completed_at`, `revision`; terisolasi dengan `user_scope` dan wallet opsional. |
| `user_points_ledger` | Riwayat kredit/reversal append-only, campaign/quest/wallet, `reason`, `created_at`. |

Index `user_quest_progress(user_scope,quest_id,coalesce(wallet_address,''))` diperlukan karena SQLite tidak menganggap NULL setara pada UNIQUE biasa. Semua akses privat menggunakan `user_scope=tg:<id>` setelah HMAC `X-Telegram-Init-Data` diverifikasi. Update progress+ledger menggunakan D1 `batch()`, revision optimistic concurrency, dan ledger ID per revision; query memakai prepared statements.

## Status dan metode verifikasi
Jenis: social, testnet_task, mainnet_task, bridge, swap, liquidity, governance, referral, kyc, custom.

Metode: manual, wallet_activity, url_submission, admin_review, none. Status: todo, in_progress, submitted, verified, failed, expired, not_applicable.

Untuk pelacakan manual/none: todo → in_progress/submitted/not_applicable; in_progress → submitted/failed/not_applicable/todo; submitted → todo/failed/not_applicable; failed → todo/in_progress; not_applicable → todo. URL submission membutuhkan HTTPS evidence sebelum submitted dan hanya admin review dapat verified. Untuk admin_review, pengguna hanya dapat mengirim submitted atau not_applicable, admin menandai verified setelah evidence valid. Untuk wallet_activity, **hanya evaluator** boleh verified berdasarkan hasil `eligibility_results` yang `passed`, terikat wallet milik user, campaign, rule ID dan evidence HTTPS. Tidak ada auto-complete untuk quest sosial.

Quest wallet_activity harus mempunyai `campaign_quests.id` yang sesuai dengan `eligibility_results.rule_id`. Scan wallet yang tersimpan menghasilkan progres terverifikasi hanya jika data on-chain memenuhi persyaratan. Scan ad-hoc address-only tidak otomatis menulis progress. Status `expired` dihitung dari `ends_at`, tidak dapat dipilih sewenang-wenang.

## Poin, streak dan eligibility
Saat transisi ke verified, ledger menambahkan kredit poin internal; request ulang tidak menduplikasi poin. Saat verified → failed, ledger membuat entri negatif `quest_verification_reversed` tanpa menghapus historinya. Setelah reversal, re-verifikasi dapat mengembalikan net hingga jumlah poin quest, bukan menggandakan total. Jumlah poin quest dikunci setelah ledger pertama tercatat.

Streak menghitung hari lokal dari quest yang masih verified dengan timezone IANA dari perangkat; default UTC bila tidak tersedia/invalid. Streak reset bila tidak ada verifikasi dalam 48 jam. Modul ini tidak menambah notifikasi; quiet hours alert terdahulu tidak diubah.

Quest required hanya memberi indikator eligibility `passed` jika metode mendukung verifikasi dan mempunyai evidence sah. Jika bukti belum tersedia, indikator tetap `manual_check`. Indikator ini **tidak** mengubah keputusan airdrop final maupun menjanjikan reward.

Poin hanya metrik pelacakan internal, **bukan token, saldo, keuntungan, atau jaminan reward**.

## Next Best Action
`GET /api/aggregator/next-actions` membagi maksimal 100 item ke `harus_segera`, `minggu_ini`, `bisa_menunggu`. Quest verified, not_applicable, expired, atau campaign kedaluwarsa dikecualikan. Urutkan berdasarkan deadline, bobot, poin, usaha, gas, dan status campaign. Prioritas internal:

```text
priority = deadline_urgency * 3 + quest_weight * 2 + points * 0.5
           - estimated_effort - estimated_gas_cost
```

Setiap item memuat campaign name/slug, judul quest, status, poin, deadline, hours_left, dan alasan Bahasa Indonesia. Angka ini bukan prediksi nilai hadiah.

## API
- `GET /api/aggregator/campaigns/:slug/quests`: daftar quest, pagination (`limit`, `offset`).
- `POST /api/aggregator/campaigns/:id/quests`, `PUT|DELETE /api/aggregator/quests/:id`: admin-only (`AGGREGATOR_ADMIN_TOKEN`).
- `GET /api/aggregator/quests/my`: progress pribadi, ledger poin paginasi, total poin dan streak (`timezone` IANA).
- `POST|PUT /api/aggregator/quests/:id/progress`: perubahan status pemilik; admin bisa verify dengan Bearer token dan body `user_scope`.
- `POST /api/aggregator/quests/:id/evidence`: submit evidence HTTPS.
- `GET /api/aggregator/campaigns/:slug/progress`: progress bar dan indikator required eligibility.
- `GET /api/aggregator/next-actions`: rekomendasi pribadi dengan `limit` maksimum 100.

Batas: title 160, description 4000, note 1000, URL 2048 karakter. Enum ketat, HTTPS-only dan proteksi private-host, output HTML/atribut di-escape di frontend. Semua user API hanya membaca/mengubah user_scope sendiri. `DELETE /api/aggregator/privacy` membersihkan tracker user termasuk ledger.

## Pengujian dan deployment
```sh
npm ci
npm run build
npm test
npx wrangler d1 migrations apply airdrop-museum --local
npx wrangler d1 migrations apply airdrop-museum --remote
npx wrangler deploy
```

Lakukan backup dahulu: `npx wrangler d1 export airdrop-museum --remote --output=backup-before-sprint4.sql`. Pastikan konfigurasi D1 DB, `TELEGRAM_BOT_TOKEN`, `AGGREGATOR_ADMIN_TOKEN`, provider/indexer resmi, dan queue/Cron scan sudah tersedia. Verifikasi status migrasi 0005/0008 serta integrasi Sprint 2/3 sebelum deploy. Workflow `.github/workflows/sprint-4-quest.yml` menjalankan npm ci, build, test pada push/PR yang sesuai.

## Rollback dan batas verifikasi
D1 tidak memiliki rollback otomatis migrasi. Rollback paling aman adalah mengembalikan versi aplikasi tanpa menghapus tabel atau ledger baru. Untuk rollback database, pulihkan backup yang diambil sebelumnya mengikuti prosedur recovery. Jangan `DROP TABLE` ledger produksi karena akan menghilangkan histori audit.

Input evidence yang dikirim user hanya pengajuan, bukan bukti otomatis. UI menampilkan: **“Status quest adalah catatan pribadi dan bukan jaminan eligibility atau reward.”** Data tergantung kualitas sumber; jika evaluator belum mempunyai bukti, status eligibility tetap tidak terverifikasi.
