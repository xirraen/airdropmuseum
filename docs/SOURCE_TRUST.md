# SOURCE TRUST — Sprint 7

## Cakupan dan batasan
Source Trust & Cross-Verification adalah **penilaian platform berbasis sumber publik**, bukan verifikasi keamanan, verdict scam/aman, kepastian eligibility, atau janji reward. Tidak ada auto-publish, auto-claim, signing, atau perubahan ke payload pada registry campaign yang dilakukan oleh engine ini. Semua status keputusan manual diberi audit trail.

## Model dan tier
- **primary_official**: domain yang dicatat di tabel am_domains dan direview untuk campaign tersebut, subdomain dari domain terverifikasi, domain yang secara eksplisit ditandai terverifikasi oleh admin, atau explorer kontrak yang secara eksplisit terkait dengan alamat kontrak campaign.
- **official_social**: tautan sosial ditemukan pada halaman website resmi dan ditandai oleh admin sebagai linked_from_official; social handle yang tidak cocok dikecualikan.
- **independent**: sumber yang tertaut dari official website tetapi tidak diklasifikasi sebagai official social.
- **community**: sumber terdaftar yang belum punya bukti sebagai sumber resmi.
- **unknown**: sumber yang belum dapat diklasifikasi.

Skor sumber = base tier (55 primary, 45 social, 30 independent, 15 community, 0 unknown) + bonus tautan official 15 + bonus konsistensi 0–15 – penalti material conflict 20 per konflik – minor conflict 7 per konflik – stale penalty 12 jika lebih dari 24 jam, 25 jika lebih dari 7 hari. Nilai dibatasi 0–100. Angka bukan probabilitas, endorsment, maupun legitimasi.

Confidence campaign: high_confidence mensyaratkan sedikitnya dua sumber primary_official berhasil diperiksa, tidak ada konflik material terbuka, dan data snapshot/claim tersedia atau seluruh tanggal claim/snapshot secara eksplisit tidak berlaku. Status lain: medium_confidence, low_confidence, needs_review. Semua tetap memerlukan review manusia.

## Alur cross-verification
1. Admin memasukkan sumber terdaftar dengan metode PUT /api/trust/sources/:id. Body JSON harus memiliki campaign_id dan source_url HTTPS. Opsional: official_domain_verified, linked_from_official, explorer_approved, enabled, not_applicable.
2. Verifikasi POST /api/trust/campaigns/:id/verify membuat verification run berstatus running. Repeated request pada slot jam yang sama menggunakan idempotency key; selesai menjadi complete atau failed.
3. HTTP fetch hanya untuk URL HTTPS yang telah terdaftar. Robots.txt diperiksa sebelum fetch halaman, redirect ditolak, timeout 9 detik, body maksimum 256 KiB, content-type dibatasi HTML/XML/JSON.
4. Parser hanya menyimpan metadata ringkas dari meta tags atau payload structured JSON/XML dan tautan sosial official. Artikel penuh tidak disimpan. Output dibatasi pada 12 field: project_name, chain, category, snapshot_at, activity_start_at, activity_end_at, claim_opens_at, claim_deadline_at, eligibility_rules, official_urls, token_contract, claim_contract.
5. Fingerprint SHA-256 dan canonical comparison dipakai antar dua sumber terdaftar berbeda. Selisih tanggal/chain/kontrak/eligibility/official_urls berstatus material, perbedaan nama minor, dan category informational.
6. Konflik baru berstatus open. Bila semua fetch berhasil dan selisih tak lagi direproduksi, sistem dapat menandai resolved dengan audit system. Moderator dapat melakukan resolve atau ignore dengan alasan wajib dan audit; konflik yang telah ditutup tidak diubah otomatis pada fingerprint sama.
7. Skor, status dan perubahan disimpan dalam verification_runs serta source_conflicts. Data campaign registry tidak ditimpa otomatis.

## KV cache dan scheduler
Binding Workers KV: TRUST_CACHE. Default TTL 21600 detik (6 jam), dengan key:
- trust:source:{sha256_url} berisi fetched_at, content_hash, extracted metadata, http_status, ETag, Last-Modified
- trust:campaign:{campaign_id}:latest berisi summary run terbaru
- trust:fingerprint:{hash} berisi fingerprint timestamp/hash tanpa artikel penuh

Jika cache expired, conditional request mengirim If-None-Match / If-Modified-Since; HTTP 304 memanfaatkan metadata yang sudah tersimpan dalam D1. KV adalah cache, D1 merupakan system of record.

Cron: 37 */6 * * * (UTC). Maksimal 20 campaign terbit/aktif per sweep, prioritas konflik terbuka, claim/snapshot dalam 7 hari, perubahan source terdaftar, lalu status confirmed. Run dalam 6 jam terakhir dilewati.

## Alert penting dan delivery
Alert dibuat jika ada konflik material baru, claim_opens_at/claim_deadline_at/snapshot_at berubah, official_urls berubah, claim_contract berubah, atau confidence_label menurun. Event deduplicated SHA-256, memuat field, nilai lama/baru, source URL, tautan detail campaign dan disclaimer verifikasi manual. Disimpan sebagai am_notifications milik moderator yang terdaftar; Telegram dikirim menggunakan am_delivery_queue hanya untuk admin Telegram yang telah opt in. Tidak ada raw article, token, atau private data di log maupun alert.

## API dan UI
Admin-only: POST /api/trust/campaigns/:id/verify, PUT /api/trust/sources/:id, POST /api/trust/conflicts/:id/resolve, POST /api/trust/conflicts/:id/ignore, GET /api/trust/conflicts?status=open.

Read boleh publik untuk campaign non-draft: GET /api/trust/campaigns/:id/verification, GET /api/trust/campaigns/:id/conflicts, GET /api/trust/sources?campaign_id=....

UI bahasa Indonesia menyediakan tab Trust & Verifikasi di exhibit detail, dan konsol /trust.html dengan ringkasan, confidence, tier/score, tanggal cek terakhir, konflik dua sumber, riwayat run, tombol verifikasi, selesai, abaikan, dan buka sumber. Semua data tidak tepercaya dimasukkan lewat DOM textContent, bukan HTML mentah.

## Keamanan
- Hanya HTTPS tanpa kredensial, tanpa IP literal/host internal; redirect dan robots.txt denial ditolak.
- Admin-only mutation memakai cookie session / Telegram init-data server-verified, same-origin check, dan rate limit.
- Tidak ada penyimpanan artikel penuh, hanya metadata, ringkasan, fingerprint dan URL.
- Jika source fetch gagal, status old conflict tidak diselesaikan otomatis.
- Reviewer harus memeriksa domain serta konfirmasi secara manual. Link social tidak otomatis menjadi official hanya karena feed menyebutnya.

## Persiapan deployment
1. Deploy bergantung pada branch Sprint 6 yang memuat migrations/0010_discovery_automation.sql. Main saat Sprint 7 dibuat belum memiliki modul itu. Jangan merge Sprint 7 langsung ke main tanpa mengintegrasikan Sprint 6.
2. npm ci; npm run build; npm test.
3. Backup D1, jalankan migrasi berurutan sampai migrations/0011_source_trust.sql, lalu verifikasi tabel.
4. Periksa wrangler.jsonc: binding DB, TRUST_CACHE, cron 37 */6 * * *; rahasiakan TELEGRAM_BOT_TOKEN sebagai Worker secret. MODERATOR_IDS berupa daftar ID user terverifikasi, TRUST_PUBLIC_ORIGIN berupa base URL HTTPS untuk tautan alert.
5. Setelah CI lulus dan review, jalankan npx wrangler deploy. Deploy belum dilakukan otomatis pada pekerjaan Sprint 7.

## Rollback
Hentikan cron Sprint 7, kembalikan route dan UI ke commit sebelum Sprint 7, lalu deploy Worker sebelumnya. Metadata KV akan kedaluwarsa dalam 6 jam. Untuk rollback skema, backup D1 dahulu, kemudian drop trust_audit_log, verification_runs, source_conflicts, campaign_source_links, source_trust_profiles; hapus marker versi 7 pada am_core_schema. JANGAN drop tabel migrasi 0001–0010 atau menghapus audit historis sebelum backup. Hentikan delivery alert yang masih pending jika rollback dilakukan setelah event dibuat.
