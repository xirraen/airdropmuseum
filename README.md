# Airdrop Museum

Aggregator airdrop dan ruang riset Web3 berbahasa Indonesia, menggunakan Cloudflare Workers + D1. Halaman utama: **https://airdrop-museum.xirraen.workers.dev/**. Museum/workbench versi lama tetap tersedia di `/museum.html`.

## Aggregator Core 2.0 — Discovery, Eligibility, Snapshot & Claim Monitoring

- **Discovery:** registry bersumber resmi dengan chain, kategori, status, snapshot/deadline, reward, estimasi gas dan ketentuan KYC. Mendukung beberapa feed JSON yang diizinkan operator.
- **Wallet watchlist:** alamat publik EVM/Solana, label pribadi dan hasil scan tersimpan lokal secara default. Address-only scan tidak memerlukan wallet connect.
- **Eligibility:** 12 tipe rule dengan alasan Indonesia, parameter, timestamp dan evidence. Kegagalan provider menghasilkan unknown. Saldo terkini tidak digunakan untuk membuktikan snapshot/cutoff historis.
- **Claim monitor:** hanya endpoint resmi yang diizinkan; status claimable/already_claimed/not_eligible memerlukan respons terikat address, chain, campaign dan waktu. Sumber belum dapat diverifikasi → **Perlu pemeriksaan manual**.
- **Prioritas pribadi:** urgensi, kemajuan rule, usaha, gas, confidence evidence dan minat kategori; UI hanya menampilkan Tinggi/Sedang/Rendah, bukan perkiraan keuntungan.
- **Quest dan poin:** catatan manual jelas ditandai belum terverifikasi. Poin akun sosial tidak dianggap terbukti hanya dari alamat wallet.
- **Alert:** Telegram opt-in untuk campaign baru, snapshot 7 hari, claim dibuka, deadline 72 jam, eligibility berubah, quest baru dan sumber berubah. Sinkronisasi Core hanya untuk Telegram terverifikasi.
- **Evidence:** timeline sumber, perubahan status dan fingerprint halaman. Perubahan sumber memaksa pemeriksaan manual sampai metadata ditinjau ulang.

CONFIRMED, RUMORED, SPECULATIVE dan EXPIRED adalah status campaign; semuanya terpisah dari hasil kelayakan wallet. Tidak ada jaminan eligible, keamanan atau reward. Core tidak meminta/menyimpan seed phrase, private key, signature atau sesi wallet dan tidak melakukan klaim, approve, atau transaksi otomatis.

## Registry awal dan batas verifikasi

Feed kurasi `/official-registry.json` memuat:

| Catatan | Status | Batas interpretasi |
| --- | --- | --- |
| Layer3 CUBE & Activations | speculative | Kredensial dan aktivitas; bukan konfirmasi alokasi token baru |
| Galxe Loyalty XP & GG | speculative | Poin akun platform; pemeriksaan manual, bukan klaim token |
| Jupiter ASR Jan–Mar 2026 | expired | Catatan historis dari halaman resmi yang menampilkan Ended |

Tidak ada tanggal, alokasi atau endpoint claim yang ditebak. Feed tambahan memerlukan peninjauan dan allowlist. RPC bawaan Ethereum/Base membaca saldo/counter/kepemilikan saat ini; aktivitas protokol, volume, LP dan histori snapshot memerlukan indexer terkonfigurasi. Solana native balance memerlukan RPC_SOLANA. Tidak semua proyek menyediakan endpoint claim yang didukung.

## Development dan pengujian

```sh
npm ci
npm run build
npm test
npm run dev
```

`npm run dev` menjalankan Worker dengan SQLite in-memory dan migrasi 0001–0005. Mode server lokal tidak menyimpan data uji setelah proses berhenti. Preview statis `dist/` tidak menyediakan API D1.

Pengujian mencakup validasi EVM/Solana, registry/evidence, seluruh rule, status dan tanggal, claim monitor, alert, Queue/Cron, sanitasi, isolasi Telegram, migrasi, backup lama dan perubahan sumber. Mock provider/bot tidak membuktikan layanan eksternal produksi aktif.

## Deployment

`wrangler.jsonc` memasang D1, producer/consumer Queue, DLQ dan Cron setiap 15 menit. Migrasi baru: [`migrations/0005_aggregator_core.sql`](migrations/0005_aggregator_core.sql). Migrasi ini menambah tabel tanpa menghapus `am_*` atau backup lama.

Diperlukan untuk aktivasi penuh:

- Secret `TELEGRAM_BOT_TOKEN` untuk verifikasi Telegram dan pengiriman alert.
- Secret `AGGREGATOR_ADMIN_TOKEN` untuk ingest/review registry oleh operator.
- `AGGREGATOR_INDEXER_URL` dan secret `AGGREGATOR_INDEXER_TOKEN` jika provider memerlukannya.
- `RPC_SOLANA` serta `RPC_<chainId>` tambahan sesuai chain; simpan sebagai secret jika URL mengandung API key.
- `AGGREGATOR_ALLOWED_HOSTS`, `AGGREGATOR_DISCOVERY_URLS`, `AGGREGATOR_MONITOR_SOURCES` dan `PUBLIC_APP_URL`.

Jangan memasukkan secret ke frontend, git, parameter URL publik, atau catatan riset. Token Telegram/indexer tidak dibuat dari kredensial wallet pengguna.

Lihat [`docs/AGGREGATOR_CORE.md`](docs/AGGREGATOR_CORE.md) untuk model data, API, kontrak feed/indexer/claim, status produksi, konfigurasi, privasi dan rollback. Source dan metadata dapat berubah; periksa kembali setiap sumber resmi sebelum mengambil keputusan.

## Kompatibilitas museum lama

Museum/workbench lama di `/museum.html` mempertahankan katalog demo yang diberi label, checklist, dossier, ledger, kalender, referral dan API platform sebelumnya. Data demo tidak dimasukkan ke registry Core sebagai airdrop aktif. Backup v1/v2 dapat dipertahankan dalam envelope Core dan dipulihkan melalui importer museum lama. Sesi wallet/email platform lama tidak dapat digunakan untuk mengakses data privat Aggregator Core.

Dokumen versi lama seperti [`docs/SERVER_CORE.md`](docs/SERVER_CORE.md), [`docs/WORKBENCH_1_1.md`](docs/WORKBENCH_1_1.md) dan [`docs/ACTION_DESK_1_2.md`](docs/ACTION_DESK_1_2.md) menjelaskan fitur museum terdahulu; gunakan AGGREGATOR_CORE.md untuk perilaku Core 2.0.
