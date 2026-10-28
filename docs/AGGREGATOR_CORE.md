# Aggregator Core 2.0

Core merupakan jalur utama `/` dan `/aggregator.html`. Katalog/workbench lama tersedia di `/museum.html`; backup dan tabel `am_*` lama tidak diubah. Campaign demo lama tidak otomatis menjadi campaign terkonfirmasi. API Core memakai namespace `/api/aggregator/`, terpisah dari API platform lama.

## Model data

Migrasi `migrations/0005_aggregator_core.sql` menambahkan:

| Tabel | Fungsi |
| --- | --- |
| campaigns | Identitas, slug, project, chain[], kategori, status, URL resmi, aturan, tanggal, risiko, evidence, gas USD, reward, KYC, effort, distributor dan endpoint claim |
| campaign_sources | Timeline evidence append-only; perubahan status dan sumber disimpan bersama registry dalam batch D1 transaksional |
| wallet_watchlist | Alamat publik, chain, label, pemilik Telegram, waktu scan |
| wallet_snapshots | Saldo integer dalam wei/lamports, aktivitas protokol, evidence, waktu scan |
| eligibility_results | Hasil per rule beserta parameter, alasan Indonesia, evidence dan timestamp |
| claim_checks | Status claim yang terpisah dari eligibility dan status campaign |
| quest_progress | Quest per wallet/campaign; laporan manual tidak menjadi kelulusan terverifikasi |
| alerts | Outbox Telegram, id deduplikasi, lease pengiriman, retry, status pengiriman |
| alert_preferences | Opt-in, filter campaign, tipe event; chat diturunkan dari identitas Telegram terverifikasi |
| aggregator_cursor | Fingerprint feed discovery untuk menghindari impor ulang data sama |
| aggregator_rate_limits | Batas request dan scan per hash IP/pengguna, dibersihkan Cron |

Array dan objek disimpan sebagai JSON. Semua tanggal memakai ISO 8601 UTC. UI merender tanggal dalam locale Indonesia pada zona perangkat. `last_verified_at` mengikuti timestamp evidence terakhir; waktu impor bukan bukti bahwa isi sumber baru saja dicek.

`confirmed`, `rumored`, `speculative`, `expired`, `archived` adalah status pengumuman, bukan kepastian eligibility atau keamanan. Deadline terlewat menghasilkan effective status expired pada API; Cron menyimpan transisi tersebut beserta evidence alasan waktu. Ini bukan verifikasi ulang halaman sumber.

## Alur discovery → eligibility → alert → claim check

1. Cron setiap 15 menit mengambil beberapa feed JSON resmi atau feed kurasi yang diizinkan operator. Feed berasal dari `AGGREGATOR_DISCOVERY_URLS`; semua host feed dan URL resmi campaign harus ada dalam `AGGREGATOR_ALLOWED_HOSTS`. Setiap campaign harus memiliki minimal satu URL resmi dan evidence bertipe official_docs, official_blog, atau contract yang cocok persis dengan salah satu URL resmi.
2. Validasi metadata, URL HTTPS, chain, enum, waktu, evidence dan rule. Konten tidak valid gagal per campaign. Sumber gagal tidak menghapus campaign dan tidak menjadikannya confirmed. Fingerprint SHA-256 mencegah pemrosesan ulang payload identik. Perubahan status/evidence dicatat secara atomik.
3. Pengguna menyimpan alamat di perangkat. Scan address-only mengirim alamat ke Worker dan provider, kemudian mengembalikan hasil tanpa menyimpan alamat/hasil pada server. Tidak ada connect, signature, session wallet atau transaksi dalam alur Core.
4. Untuk sinkronisasi eksplisit, header Telegram `initData` diverifikasi HMAC dan umur maksimum satu jam. Pemilik selalu diturunkan dari identitas terverifikasi, bukan body request. Watchlist server dimasukkan ke Queue oleh Cron (maksimal 20 alamat per sweep, 50 campaign per alamat). Tanpa binding Queue, fallback Cron memproses batch kecil secara langsung.
5. Provider menghasilkan observasi terkait address, chain, rule, parameter dan evidence. Engine mengevaluasi 12 tipe rule. Data tidak ada/gagal/tidak lengkap menghasilkan unknown, bukan gagal. Evidence historis wajib untuk campaign dengan snapshot. Hasil manual tetap manual/action_required. Setiap hasil memiliki alasan Indonesia, waktu, dan referensi evidence; ketika observasi belum tersedia, sumber aturan campaign disertakan dan tidak disebut sebagai bukti kelulusan wallet.
6. Monitor claim hanya memeriksa campaign confirmed dalam periode claim. Hanya GET ke endpoint resmi pada origin URL resmi dan host allowlist. Tidak ada transaksi, approve, submit claim atau signature. Endpoint tidak tersedia/tidak cocok menghasilkan manual_check. Campaign belum dibuka, kedaluwarsa, atau belum confirmed menghasilkan unknown.
7. Outbox membuat alert new_campaign, snapshot_7d, claim_open, deadline_72h, eligibility_change, new_quest, source_changed sesuai filter dan opt-in. ID deterministik mencegah event tanggal dikirim ulang tiap Cron. Pengiriman memakai plain text, chat ID Telegram pemilik, sumber, detail campaign dan disclaimer. Pengiriman dicoba maksimal 5 kali dengan backoff. Telegram tidak menyediakan idempotency key untuk sendMessage: crash setelah Telegram menerima tetapi sebelum pencatatan sent dapat menghasilkan duplikat; delivery bersifat at-least-once, bukan exactly-once.

## Sumber dan adapter yang didukung

Core sengaja tidak menyimpulkan campaign aktif dari daftar demo atau berita tanpa URL resmi. Feed kurasi awal `/official-registry.json` berisi catatan riset Layer3, Galxe dan riwayat ASR Jupiter dari sumber resmi. Ini bukan daftar klaim aktif atau konfirmasi alokasi token baru. Operator dapat menambah feed yang diizinkan setelah melakukan tinjauan sumber resmi. Konfigurasi kosong menampilkan registry kosong dengan alasan yang jelas.

- Beberapa feed JSON HTTPS berformat `{ "campaigns": [...] }`. Setiap elemen mengikuti schema campaign di `dist/aggregator-core.js`. Feed dapat berupa feed resmi proyek atau hasil kurasi operator yang menunjuk ke dokumen/blog/kontrak resmi. Ini bukan scraper HTML/RSS universal. Hanya metadata dan note singkat maksimal 500 karakter per evidence disimpan; konten artikel penuh tidak disalin.
- RPC EVM: saldo native, transaction count, ERC-20/ERC-721 `balanceOf(address)` melalui `eth_call`, menggunakan tag finalized. Nilai selalu integer dalam unit terkecil; `parameters.min` harus memakai unit sama. RPC tidak mendukung finalized akan menghasilkan unknown.
- RPC Solana: `getBalance` finalized dalam lamports. Token, NFT, aktivitas historis dan protokol Solana memerlukan indexer. Validasi address memeriksa base58 yang terdekode tepat 32 byte; ini tidak mengasumsikan address mempunyai private key (PDA diperbolehkan).
- Indexer HTTPS yang dikonfigurasi operator untuk aktivitas protokol, volume, LP, bridge, vote, timestamp aktivitas dan histori snapshot. Core tidak menebak ABI protokol, snapshot block atau riwayat volume dari saldo saat ini.
- Claim endpoint JSON resmi yang memenuhi kontrak di bawah. Tidak semua proyek menyediakan endpoint standar ini. Distributor hanya ditampilkan sebagai referensi; Core tidak menebak fungsi kontrak claim atau menganggap ABI universal.
- Social quest, KYC/geo dan custom manual task selalu memerlukan pemeriksaan manual. Core tidak mengumpulkan data KYC atau mencoba memverifikasi sosial melalui sesi pengguna. Poin manual ditandai belum terverifikasi; tidak dihitung sebagai kelulusan.

### Contoh metadata feed (contoh pengujian, bukan campaign aktif)

```json
{
  "campaigns": [{
    "slug": "example-campaign",
    "name": "Example campaign",
    "project_id": "example",
    "chain": ["eip155:1"],
    "category": "points",
    "status": "speculative",
    "official_urls": ["https://project.example.org/docs"],
    "description": "Catatan penelitian operator.",
    "eligibility_rules": [{"id":"balance","rule_type":"token_balance","parameters":{"native":true,"min":"1000000000000000"}}],
    "snapshot_at": null,
    "claim_opens_at": null,
    "claim_deadline_at": null,
    "risk_flags": ["Reward belum diumumkan"],
    "source_evidence": [{"source_url":"https://project.example.org/docs","source_type":"official_docs","captured_at":"2026-10-27T00:00:00Z","note":"Dokumen program poin; tidak menyatakan alokasi token.","verified_by":"user"}]
  }]
}
```

### Kontrak indexer

GET `AGGREGATOR_INDEXER_URL?address=...&chain=eip155:1&campaign=...&snapshot_at=...`. Token opsional dikirim lewat Authorization Bearer. Parameter snapshot hanya ada bila campaign menetapkannya.

```json
{
  "observations": [{
    "rule_id": "bridge-arbitrum",
    "rule_type": "bridge_activity",
    "parameters": {"protocol":"example","before":"2026-10-15T00:00:00.000Z"},
    "chain": "eip155:42161",
    "address": "0x1111111111111111111111111111111111111111",
    "value": true,
    "verified": true,
    "complete": true,
    "historical": true,
    "snapshot_at": "2026-10-15T00:00:00.000Z",
    "observed_at": "2026-10-28T00:00:00.000Z",
    "evidence_refs": [{"source_url":"https://arbiscan.io/tx/example","source_type":"explorer","captured_at":"2026-10-28T00:00:00.000Z","note":"Bukti bridge sebelum snapshot.","verified_by":"system"}]
  }]
}
```

`parameters` harus sama dengan parameter rule registry, termasuk urutan key JSON. Adapter operator sebaiknya menyalin parameter rule persis. Observasi harus dibuat dalam 15 menit terakhir. `snapshot_at` harus sama persis dan `historical=true` bila campaign memiliki snapshot. Nilai false untuk aktivitas hanya dinyatakan failed jika `complete=true` (sumber meliputi seluruh cakupan syarat). Provider yang hanya mengindeks sebagian tidak dapat membuktikan tidak adanya aktivitas.

| Rule | Nilai terverifikasi |
| --- | --- |
| token_balance, nft_holdings, tx_count, volume, lp_position | String desimal non-negatif; dibandingkan dengan parameters.min menggunakan integer presisi arbitrer |
| protocol_interaction, bridge_activity, governance_vote | Boolean; false membutuhkan complete=true |
| snapshot_date | Tanggal aktivitas, dibandingkan dengan parameters.before atau snapshot campaign |
| social_task | action_required, perlu verifikasi manual |
| kyc_or_geo_restriction, custom_manual_task | manual_check |

Provider merupakan trust boundary operator: Core mengecek pengikatan dan format bukti, tidak secara independen membuktikan seluruh indeks atau merekonstruksi seluruh blockchain. Sumber dapat berubah; hasil historis perlu ditinjau kembali. Alasan kelulusan tidak berarti seluruh campaign pasti eligible; agregasi passed hanya jika semua rule yang diketahui passed, dan campaign tanpa rule menghasilkan unknown.

### Kontrak claim endpoint

GET endpoint resmi dengan query `address` dan `chain`. Contoh respons:

```json
{"campaign_id":"example-campaign","address":"0x1111111111111111111111111111111111111111","chain":"eip155:1","status":"claimable","verified":true,"checked_at":"2026-10-28T00:00:00.000Z"}
```

Status hanya claimable, already_claimed, not_eligible, unknown, manual_check. Tiga status pertama memerlukan address/chain/campaign cocok, verified=true, waktu valid maksimal 15 menit. Respons tidak memenuhi kontrak, HTTP gagal atau endpoint tidak diizinkan → manual_check, bukan not_eligible. Link resmi, chain, distributor dan deadline tetap ditampilkan.

## API

Semua URL diawali `/api/aggregator`.

| Method / path | Akses / fungsi |
| --- | --- |
| GET /capabilities | Konfigurasi aktif tanpa mengungkap endpoint privat/token |
| GET /campaigns | Publik, filter chain/status/category/deadline_before/snapshot_before/reward_type/max_gas/kyc_requirement |
| GET /campaigns/:slug | Campaign dan timeline evidence |
| POST /scan | `{address,chain,campaign_id}`; read-only, tanpa persistensi |
| POST /admin/campaigns | Bearer AGGREGATOR_ADMIN_TOKEN; validasi dan upsert registry + evidence |
| POST /admin/discover | Bearer admin; menjalankan discovery feed terkonfigurasi |
| GET /wallets | Telegram; watchlist pemilik |
| POST /wallets | Telegram; `{address,chain,label,consent_sync:true}` |
| DELETE /wallets/:id | Telegram; hapus alamat dan hasil terkait melalui cascade |
| GET /results?wallet_id=... | Telegram; snapshot, rule, claim dan quest pemilik |
| PUT /quests | Telegram; `{wallet_id,campaign_id,quest_id}`; laporan manual → manual_check, verified=false |
| GET /preferences | Telegram; default alert nonaktif |
| PUT /preferences | Telegram; `{enabled,consent_alerts,filters,event_types}` |
| GET /alerts | Telegram; riwayat outbox pemilik |
| GET /export | Telegram; backup watchlist |
| POST /import | Telegram; `{consent_sync:true,data:backup}` |
| DELETE /privacy | Telegram; hapus seluruh data Core pemilik |

Telegram: header `X-Telegram-Init-Data`. Cookie sesi wallet/email lama tidak memberi akses data Core. POST/PUT/DELETE menolak Origin lintas situs. Body dibatasi 64 KiB; scan 10 per menit per hash IP, request umum 120 per menit, akses privat 60 per menit per pengguna. Status 429 menyertakan Retry-After. GET registry memakai cache publik 60 detik; data wallet memakai no-store. Respons provider dibatasi 256 KiB, timeout 8 detik, maksimal 3 percobaan pada gangguan sementara. Feed cache per isolate 60 detik (bukan sumber kebenaran). Redirect diblokir memakai mode manual dan penolakan eksplisit status HTTP 3xx, sesuai runtime Workers.

URL hanya HTTPS tanpa credential, port nonstandar, IP literal, localhost/domain internal. Host allowlist harus dikelola operator; jangan mendaftarkan domain yang DNS-nya mengarah ke jaringan privat. DNS rebinding pada domain operator merupakan batas konfigurasi yang tidak dibuktikan melalui lookup di Worker. Semua teks UI di-escape; link divalidasi ulang; Telegram dikirim sebagai plain text tanpa parse_mode. Utility escapeMarkdown tersedia untuk ekspor lanjutan. Input yang menyerupai mnemonic BIP39 Inggris, private key, signature atau field session wallet diblokir di Core.

## Privasi wallet dan kompatibilitas

- localStorage `am_aggregator_v1` adalah default. Label dibatasi karakter sederhana dan maksimal 6 kata. Tidak ada collector key, seed, signature atau session wallet di Core. Pemeriksaan input tidak dapat menjamin mengenali semua rahasia dalam semua bahasa; UI hanya meminta alamat publik, bukan kredensial.
- Scan anonim bersifat sementara; alamat tidak dimasukkan tabel watchlist, hasil atau log aplikasi. Provider RPC/indexer tetap menerima alamat saat scan. Core tidak mencatat payload request/response. Infrastruktur dan provider dapat memiliki logging sendiri; sesuaikan retensi/observability untuk kebutuhan privasi.
- Sinkronisasi hanya Telegram terverifikasi dengan opt-in eksplisit. Label dan alamat tidak dipublikasikan. Menonaktifkan alert menghentikan pending alert; pengiriman yang sudah diterima Telegram tidak dapat ditarik kembali.
- Hasil scan server dihapus setelah 90 hari; watchlist bertahan sampai dihapus pengguna. Label dan preferensi tetap lokal sampai pengguna menyetujui sinkronisasi. Poin/manual quest lokal belum diverifikasi dan tidak dipakai sebagai bukti on-chain.
- Export/import Core mempunyai envelope `{kind:"aggregator-core",version:1,wallets,legacy}`. UI juga mengekspor hasil scan, minat kategori, dan catatan quest lokal. Backup lama v1/v2 dipertahankan dalam `legacy` tanpa mengubahnya menjadi status eligible. Gunakan Import pada `/museum.html` untuk memulihkan workbench lama. Backup server hanya menyinkronkan wallet yang dikenali dan tidak menyimpan blob data lama sewenang-wenang.
- API platform lama dan autentikasinya tetap kompatibel untuk fitur museum lama. Mereka tidak digunakan oleh UI Core dan tidak dapat mengakses tabel privat Core melalui sesi wallet. Migrasi ini tidak menghapus data akun/sesi lama secara destruktif.

## Konfigurasi environment

| Variabel / binding | Keterangan |
| --- | --- |
| DB | Binding D1 yang sama dengan sistem lama; migrasi 0001–0005 |
| AGGREGATOR_QUEUE | Queue producer; consumer Worker yang sama; DLQ airdrop-museum-aggregator-dlq |
| TELEGRAM_BOT_TOKEN | Secret bot untuk validasi initData dan pengiriman alert; bot harus di-Start pengguna |
| AGGREGATOR_ADMIN_TOKEN | Secret acak kuat untuk ingest campaign dan discovery manual; jangan taruh di frontend |
| AGGREGATOR_INDEXER_TOKEN | Secret opsional Bearer indexer |
| AGGREGATOR_INDEXER_URL | HTTPS indexer tepercaya; simpan sebagai secret jika URL mengandung credential provider |
| RPC_1, RPC_8453, RPC_42161, RPC_10, RPC_<chainId> | HTTPS RPC EVM. Pakai Worker secret jika URL memiliki API key. RPC tidak pernah diteruskan utuh ke UI; evidence RPC hanya origin provider |
| RPC_SOLANA | HTTPS RPC Solana; pakai secret untuk endpoint privat |
| AGGREGATOR_ALLOWED_HOSTS | Daftar host tepat, dipisahkan koma, untuk feed/official URL/claim endpoint. Tidak mencakup wildcard |
| AGGREGATOR_MONITOR_SOURCES | Set `1` untuk memeriksa fingerprint teks sumber resmi secara berkala; perubahan menambahkan risk flag dan memaksa pemeriksaan manual sampai operator meninjau ulang |
| AGGREGATOR_DISCOVERY_URLS | Daftar URL feed JSON HTTPS, dipisahkan koma; maksimum 10 feed per sweep |
| PUBLIC_APP_URL | Origin aplikasi publik untuk tautan detail dalam alert |

Bawaan repo: RPC Ethereum dan Base publik yang sudah ada; discovery memakai feed kurasi internal dengan host resmi yang telah ditinjau. Monitor sumber diaktifkan untuk host tersebut. Tidak diperlukan private key wallet, signer, relayer, approval key atau Telegram session pengguna. Secret VAPID/EMAIL lama tidak diperlukan Core dan harus dipertahankan saat deploy untuk fitur lama.

## Build, test dan deploy

```sh
npm ci
npm run build
npm test
npx wrangler d1 export airdrop-museum --remote --output /secure/path/pre-core-2.sql
npx wrangler d1 migrations apply airdrop-museum --remote
npx wrangler queues create airdrop-museum-aggregator
npx wrangler queues create airdrop-museum-aggregator-dlq
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put AGGREGATOR_ADMIN_TOKEN
npx wrangler deploy
```

Perintah queue create cukup dijalankan sekali. Isi env discovery/allowlist dan RPC/indexer sesuai provider, lalu deploy. Wrangler config memasang producer, consumer, DLQ dan Cron 15 menit. `scripts/package-upload.mjs` mendukung multipart Worker upload melalui API dan menyertakan modul Core + binding queue; konfigurasi consumer dan Cron tetap harus diterapkan melalui API/Wrangler. Secret yang sudah ada harus dipertahankan, jangan mengganti seluruh binding secara buta.

Verifikasi setelah deploy: `/`, `/api/aggregator/capabilities`, `/api/aggregator/campaigns`; test scan tanpa provider harus unknown, tidak membuat watchlist. Verifikasi Telegram dan alert nyata memerlukan token bot serta pengguna opt-in. Test otomasi memakai SQLite asli, fixture HMAC independen dan provider/Telegram tiruan; hasil test bukan bukti bahwa provider eksternal atau pengiriman bot produksi sudah aktif.

## Rollback

Migrasi hanya menambah tabel, jadi rollback aplikasi ke versi sebelum Core aman tanpa menghapus tabel baru. Nonaktifkan Cron/consumer Core, deploy versi Worker sebelumnya, dan pertahankan semua tabel sampai backup diverifikasi. Ini opsi utama karena tidak membuang watchlist/evidence.

Jika rollback schema memang diperlukan, ekspor D1 dahulu dan hentikan seluruh penulis. Hapus tabel dalam urutan: alerts, alert_preferences, quest_progress, claim_checks, eligibility_results, wallet_snapshots, wallet_watchlist, campaign_sources, campaigns, aggregator_cursor, aggregator_rate_limits. Hapus hanya row version=5 dari am_core_schema dan pencatatan 0005 dari d1_migrations jika memang menggunakan Wrangler migration ledger. Jangan menghapus atau mengubah tabel am_* lain. Penghapusan tabel Core bersifat destruktif; bukan langkah deployment normal.

## Deployment 28 Oktober 2026

- Worker produksi: https://airdrop-museum.xirraen.workers.dev/
- Migrasi 0005 diterapkan ke D1 yang sudah ada; schema versions 1–5 terkonfirmasi. Ledger d1_migrations dicatat agar Wrangler tidak mengulang ALTER TABLE 0004 yang sudah diterapkan sebelumnya.
- Queue `airdrop-museum-aggregator`, consumer Worker yang sama, batch 5, retry 3, dan DLQ `airdrop-museum-aggregator-dlq` sudah dibuat.
- Cron `*/15 * * * *` sudah dipasang.
- Endpoint capabilities terverifikasi: version 2.0, address_only=true, local_default=true, queue=true, Telegram sync=false, discovery_configured=false, RPC Ethereum/Base tersedia dalam konfigurasi.
- Endpoint registry merespons 200 dengan daftar kosong. Belum ada feed resmi/operator yang disetujui; ini tidak ditampilkan sebagai data airdrop aktif.
- npm ci, npm run build dan npm test lulus (122 tests). Browser produksi juga diperiksa: halaman utama, registry kosong yang jujur, penyimpanan alamat uji lokal, serta persistensi setelah reload berjalan. Browser lokal tidak berhasil mengunduh Chromium; pemeriksaan ini memakai cloud browser desktop, bukan emulasi viewport mobile.
- Masih perlu konfigurasi operator: TELEGRAM_BOT_TOKEN dan AGGREGATOR_ADMIN_TOKEN; host/URL feed resmi yang diizinkan; indexer historis beserta token bila diperlukan; RPC tambahan sesuai chain. Alert nyata dan klaim campaign tertentu belum diuji terhadap akun atau endpoint produksi.

### Lanjutan registry dan monitor sumber

Feed kurasi awal kini diaktifkan. Layer3 CUBE/Activations dan Galxe XP/GG berstatus speculative untuk peluang airdrop; ASR Jupiter Jan–Mar 2026 berstatus expired berdasarkan halaman resmi yang menampilkan Ended. Tidak ada snapshot, deadline, nominal alokasi atau endpoint claim yang ditebak. Galxe menggunakan chain `offchain` karena poin akun platform tidak dapat dibuktikan dari alamat wallet. Scan wallet EVM/Solana tetap dapat menampilkan tugas manual lintas akun tersebut.

Monitor memproses maksimal 10 URL resmi per Cron dengan cursor bergilir, membuang script/style/tag untuk fingerprint teks, dan hanya menyimpan hash, URL, waktu dan note singkat. Perubahan menambahkan `source_changed_review_required` secara atomik dengan evidence dan fingerprint. Rule eligibility serta claim monitor kemudian menghasilkan manual_check sampai operator meninjau dan mengirim metadata/evidence baru. Monitor tidak otomatis menjadikan perubahan halaman sebagai campaign confirmed atau bukti kelayakan wallet. Sumber gagal dibaca dicatat maksimal sekali per hari tanpa mengubah status menjadi gagal/eligible. Redirect dan respons terlalu besar tetap gagal aman.

Rule dengan cutoff pada parameter `before`/`snapshot_at` atau `block_tag` juga memerlukan observasi historis yang cocok; current RPC tidak digunakan sebagai pengganti histori. Cutoff masa depan tidak bisa dinilai sebagai snapshot yang sudah final.

Rule `indicator_only` pada catatan riset tidak diperlakukan sebagai syarat alokasi token: temuan on-chain tetap menghasilkan manual_check dengan alasan eksplisit. Scan address-only memproses portfolio dan evaluasi secara paralel; pembacaan eligibility/claim mempunyai budget total 20 detik dan timeout tidak dicoba ulang setelah abort.

Pembacaan provider gagal aman dengan `provider_status` berupa kategori teknis yang dibatasi, tanpa pesan exception mentah, alamat RPC berisi key, atau respons upstream penuh.

Uji produksi menemukan bahwa Workers tidak menerima mode fetch redirect=error. Transport sudah memakai redirect=manual lalu menolak 3xx secara eksplisit; ini menjaga larangan mengikuti redirect tanpa menyebabkan semua pembacaan provider gagal.

Setelah perbaikan transport, scan produksi pada alamat publik uji di Base berhasil membaca saldo finalized dan bukti RPC untuk indikator CUBE. Hasil keseluruhan tetap manual_check sesuai kebijakan riset, persisted=false, dan wallet_watchlist server tetap kosong. Diagnostik sementara sudah dihapus; respons tidak berisi pesan exception mentah.
