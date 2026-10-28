# Sprint 9 — Admin Console & Operations

## Baseline dan dependensi

Sprint ini berbasis branch \`feat/sprint-8-public-api\`, bukan \`main\`, karena Sprint 8 belum digabung. Terapkan migrasi \`0001\`, \`0003\`, \`0010\`, \`0011\`, \`0012\` **sebelum** \`0013_admin_operations.sql\`. Sprint 2–5 yang berada di branch lain tetap perlu direkonsiliasi sebelum deployment lengkap; jangan deploy migrasi ke produksi tanpa memverifikasi riwayatnya. Admin UI di \`/admin\` menggunakan cookie \`am_session\` (HTTPOnly/Secure/SameSite=Strict) dari login platform. Telegram admin initData langsung tidak membuat sesi admin; login dengan sesi platform terlebih dahulu.

## Bootstrap / Role / least privilege

Pengguna yang sebelumnya telah melakukan login dapat dipromosikan oleh operator database terpercaya (bukan lewat API):

\`\`\`sql
INSERT INTO admin_users(admin_scope,role,enabled)
VALUES('tg:<TELEGRAM_USER_ID>','super_admin',1);
\`\`\`

Ganti placeholder dengan ID \`am_users.id\` yang telah diverifikasi; \`admin_scope\` hanya dapat menunjuk principal yang valid. Tidak ada super admin default. Jangan pernah gunakan \`MODERATOR_IDS\` sebagai jalan pintas akses Sprint 9.

| Role | Hak |
| --- | --- |
| super_admin | Seluruh operasi, termasuk maintenance dan system settings |
| admin | Campaign, discovery, konflik, API key, webhook, feature flags; lihat dashboard, health dan audit |
| moderator | Review discovery/konflik, edit campaign hanya judul/deskripsi/kategori/reviewer, lihat health/audit |
| readonly | Hanya dashboard, health dan audit log; tidak ada mutasi |

Server mengecek role setiap request. GET \`/api/admin/session\` memberikan role dan token CSRF yang terikat ke sesi; kirim pada header \`X-CSRF-Token\` saat mutasi dan bulk preview. Semua request perubahan wajib mempunyai \`Origin\` identik dengan host, dan sesi yang tidak kedaluwarsa. Token tidak dicatat di audit/Analytics. Perlindungan rate limit per principal dan IP hash berlaku pada setiap route admin.

## Routing

- \`/admin\`: console responsif, DOM textContent (tidak menempel data remote sebagai HTML).
- \`/api/admin/overview\`, \`/api/admin/session\`, \`/api/admin/audit\`, \`/api/admin/health\`.
- \`/api/admin/campaigns\` GET + \`/:id\` PUT, \`/bulk-preview\` GET dan \`/bulk-action\` POST.
- \`/api/admin/discovery/queue\` GET, \`/bulk-preview\` GET, \`/bulk-action\` POST.
- \`/api/admin/conflicts\` GET, \`/:id/resolve\` POST, \`/:id/ignore\` POST.
- \`/api/admin/api-keys\` GET/POST dan \`/:id\` PUT/DELETE (revoke).
- \`/api/admin/webhooks\` GET/POST dan \`/:id\` PUT/DELETE, \`/:id/test\` POST.
- \`/api/admin/feature-flags\` GET, \`/:key\` PUT.
- \`/api/admin/system-settings\` GET; \`/api/admin/maintenance-mode\` POST.

**Legacy write endpoints** \`/api/discovery/*\` dan \`/api/trust/*\` mengembalikan \`410 LEGACY_ADMIN_WRITE_DISABLED\`. Gunakan konsol Sprint 9. Read-only trust tetap tersedia; discovery read memerlukan sesi admin.

## Audit trail

\`admin_audit_log\` menyimpan \`admin_scope,action,target_type,target_id,before_state,after_state,ip_hash,user_agent_hash,created_at\`. State difilter lewat allowlist: tidak ada wallet, detail pengguna, API key, token atau webhook secret. Hash IP dan user agent diberi pepper (\`ADMIN_AUDIT_PEPPER\`) untuk mengurangi kemungkinan pencocokan eksternal. Akses audit hanya GET dan tidak ada endpoint delete. Audit dan perubahan harus dipantau melalui D1 backup sebelum penyesuaian produksi.

## Bulk action safety

1. Pilih 1–50 ID; GET preview dengan \`ids=a,b\`, \`action=archive|expire|republish|update_status|assign_reviewer\` atau discovery \`approve|reject|convert|duplicate\`. Untuk reject gunakan \`reason\` tidak kosong.
2. Server menyimpan fingerprint dari row dan token preview unik (TTL 5 menit), serta mencatat aksi preview.
3. Setelah pengguna mengonfirmasi di dialog, POST \`{ "preview_id": "...", "confirm_phrase": "KONFIRMASI" }\`. Server menolak preview kedaluwarsa, sudah dipakai, aktor berbeda dan snapshot stale. Hasil mengandung ID sukses/gagal per baris.
4. Archive dan expire menggunakan status/review, bukan DELETE. Konversi discovery menghasilkan **private draft**; tidak ada auto-publish. Konflik material membutuhkan pilihan sumber (\`a\` atau \`b\`), \`resolution_note\`, dan \`confirm:"RESOLVE"\`. Ignore butuh alasan.

## API key dan webhook

API key menggunakan \`am_v1_\` + 32 byte acak. D1 menyimpan SHA-256, plaintext hanya dalam respons pembuatan sekali; daftar dan audit hanya menampilkan metadata serta usage agregat. \`expires_at\` ditolak saat lewat masa berlaku. DELETE mencabut tanpa menghapus histori. Webhook HTTPS wajib ke host eksternal; secret diturunkan dari master secret dan webhook ID, dan hanya hash disimpan. Pembuatan webhook melalui **admin** tidak menampilkan secret: partner yang memerlukan nilai secret untuk validasi harus mendaftarkannya sendiri melalui endpoint partner Sprint 8, yang menampilkan secret satu kali. Test webhook mengantrekan event dummy \`test.ping\`. Riwayat delivery tidak menampilkan payload/secret.

## Feature flags dan maintenance

Flag: \`discovery_automation_enabled\`, \`wallet_scan_enabled\`, \`public_api_enabled\`, \`partner_webhooks_enabled\`, \`telegram_alerts_enabled\`, \`maintenance_mode\`. Flag memiliki deskripsi, enabled, rollout 0–100, allowed scopes, updater, waktu. KV \`TRUST_CACHE\` dipakai sebagai fallback untuk \`ADMIN_FLAGS_KV\`, TTL 60 detik, invalidasi saat perubahan. Cache KV Cloudflare bersifat eventually consistent antar edge; untuk maintenance, keputusan selalu dibaca langsung dari D1.

Mode:
- \`normal\`: operasi normal.
- \`read_only\`: request mutasi user-facing dan partner ditolak dengan 503; GET API publik tetap berjalan. Semua admin endpoint berfungsi agar mode dapat dikembalikan.
- \`maintenance\`: /v1 dan /api non-health ditolak 503 dengan \`Retry-After: 3600\`; GET HTML tetap berisi banner; \`/api/health\` dan \`/api/admin/health\` tetap dapat diakses sesuai haknya.

## Health dan metrics

Health: probe D1 dan latensinya, KV, queue bindings, lag discovery, konfigurasi Telegram, konfigurasi Etherscan, rasio kegagalan webhook, dan event cron terbaru. Tidak melakukan outbound network test. Status \`healthy\`, \`degraded\`, \`unhealthy\` tidak menjamin jaringan provider hidup.

Analytics Engine \`ANALYTICS\` dataset \`airdropmuseum_operations\` memakai \`writeDataPoint()\` hanya dengan kategori event dan status; tanpa wallet/IP/token/payload. Event yang terintegrasi di branch ini: \`api_request\`, \`webhook_delivery\`, \`discovery_item_processed\`, \`discovery_item_failed\`, \`verification_run\`, \`conflict_detected\`, serta event cron agregat ke D1. Event deklaratif lain (\`wallet_scan_completed\`, \`wallet_scan_failed\`, \`verification_run\`, \`conflict_detected\`, \`discovery_item_processed\`, \`discovery_item_failed\`, \`alert_sent\`) memerlukan titik emit di branch fitur masing-masing ketika diintegrasikan. Ini adalah dependensi merge, bukan klaim implementasi collector yang belum ada.

## Deployment, environment, rollback

\`\`\`bash
npm ci
npm run build
npm test
npx wrangler d1 migrations apply airdrop-museum --remote
npx wrangler deploy
\`\`\`

**Periksa nama database sebelum menjalankan CLI:** \`wrangler.jsonc\` menggunakan \`database_name: "airdrop-museum"\`; gunakan nilai konfigurasi tersebut (bukan contoh placeholder) saat migrasi. Sebelum apply, ekspor/snapshot D1 dan verifikasi branch Sprint 2–8 sudah disatukan. Perlu binding \`DB\`, \`TRUST_CACHE\` atau \`ADMIN_FLAGS_KV\`, \`ANALYTICS\` (dataset operations), \`DISCOVERY_QUEUE\`, \`PARTNER_WEBHOOK_QUEUE\`. Secrets: \`ADMIN_CSRF_PEPPER\` (direkomendasikan acak panjang), \`ADMIN_AUDIT_PEPPER\` (wajib untuk pseudonimisasi), \`WEBHOOK_MASTER_SECRET\` (>=32 karakter), \`TELEGRAM_BOT_TOKEN\` jika login Telegram dan \`ETHERSCAN_API_KEY\` bila provider aktif. Jangan simpan secret di \`wrangler.jsonc\`.

**Rollback:** hentikan deploy dan ubah mode ke maintenance bila perlu; restore dari snapshot D1 tervalidasi sebelum migrasi. SQLite/D1 tidak mendukung rollback otomatis \`ALTER TABLE ... ADD COLUMN\` dalam semua versi; jangan langsung DROP column atau audit log. Kembalikan worker pada commit sebelumnya *setelah* memastikan versi migrasi compatible. \`0013\` mempertahankan discovery review history saat memperluas CHECK constraint untuk aksi duplicate.

Moderasi item tunggal untuk moderator: `POST /api/admin/discovery/items/:id/approve|reject|convert|duplicate`, dengan CSRF dan alasan wajib untuk reject/duplicate. Bulk preview dibatasi admin/super_admin.

System settings yang dapat diubah oleh `super_admin`: `webhook_failure_threshold` (0.01–1) dan `discovery_lag_warning_minutes` (15–1440). Endpoint `PUT /api/admin/system-settings/:key` wajib CSRF dan mencatat audit, tanpa kunci arbitrer atau secrets.

UI admin mendukung edit campaign terbatas, review item tunggal, update/revoke API key, toggle/test/revoke webhook, dan pengaturan feature flags. Semua data UI ditambahkan memakai `textContent`, bukan HTML yang berasal dari pengguna.
