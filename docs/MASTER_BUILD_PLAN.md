# Master Build Plan — Airdrop Museum

**Snapshot audit:** repository `main`, commit `12f5abf` (shallow clone), 28 Oktober 2026. Ini adalah rencana berbasis snapshot, bukan jaminan status remote terkini.

## Ringkasan

Airdrop Museum v1.2.0 / Action Desk 1.2 sudah mempunyai UI mobile-first berbahasa Indonesia, data personal browser-local sebagai default, backend Cloudflare Worker + D1 untuk akun/sinkronisasi serta platform tambahan, empat migrasi dan test suite. `npm ci`, `npm test` (**85/85 lulus**) dan `npm run build` berhasil pada sandbox. Hasil itu tidak membuktikan D1 production, secret, provider atau deployment aktif. `npm audit` melaporkan **11 high, 0 critical** pada dependency tree; investigasi dan perbaikan terukur menjadi blocker launch.

Prompt Sprint 1–10, Claim Autopsy, Decision Entry dan prompt konsolidasi tidak ditemukan dalam file repository. Lampiran permintaan adalah satu-satunya spesifikasi yang tersedia, bukan artefak implementasi. Tidak ada CI workflow, sistem feature flag, maintenance mode, crawler, eligibility engine airdrop, auto-claim, Claim Autopsy, atau Decision Entry yang ditemukan. Tidak ada deployment yang diverifikasi.

## Peta produk/repo

| Lapisan | Bukti repo | Batas saat ini |
|---|---|---|
| Browser UI/model | `dist/*.js`, `dist/*.html`, `dist/*.css` | Data lokal/editable; bukan bukti eksternal |
| Worker/API | `src/worker.mjs`, `src/api.mjs`, `src/platform-api.mjs`, `src/rewards-api.mjs` | Route dan kesiapan kode tidak membuktikan provider/deployment |
| Storage | `migrations/0001_core.sql`–`0004_workbench.sql` | Migrasi lokal ada; penerapan live belum diverifikasi |
| Test/build | `tests/*.test.mjs`, `package.json`, `scripts/build-worker.mjs` | 85 test dan build lulus lokal; bukan CI/security assurance |
| Dokumen | 11 dokumen lama di `docs/` | Beberapa snapshot historis, gunakan README v1.2 dan dokumen terbaru sebagai konteks kini |

## Status aktual

Enum status lengkap, bukti dan catatan per area ada di [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Ikhtisar: UI/local, portfolio, export, Action Desk, campaign manual dan bukti personal memiliki implementasi dan coverage test. Core API memiliki test; auth, sync, rewards, wallet sessions, delivery, community/moderation dan quest on-chain ada sebagian/berbatas konfigurasi. Crawler/discovery automation, source trust engine, eligibility kampanye, public API produk target, partner webhook, feature flags, maintenance mode, Claim Autopsy, dan Decision Entry belum tersedia. API yang sudah ada bukanlah API publik target yang direncanakan.

## Gap dan keputusan rekonsiliasi

1. Pertahankan tiga domain poin terpisah: XP Museum lokal (browser, gamifikasi non-finansial), referral XP server (ledger idempotent dengan syarat Telegram), dan quest XP/claim yang lingkupnya harus eksplisit. Jangan menjumlahkan atau menyebut sebagai token/reward finansial. Campaign points belum ada dan tidak boleh diasumsikan sama dengan XP.
2. Bedakan guest/browser-local dari akun server. `identity` adalah autentikasi; wallet address/Telegram ID adalah metode/link identitas yang sensitif, bukan otomatis user scope. Data lokal tidak naik ke server kecuali user melakukan sync yang jelas dan terotorisasi.
3. Campaign source adalah provenance untuk klaim campaign; discovery source adalah kanal ingest; discovery item adalah kandidat belum direview; evidence adalah rekaman spesifik yang menunjang/menyangkal klaim. Jangan menyatukan tabel/kepercayaan mereka.
4. Decision Entry adalah rekaman append-only tentang keputusan, asumsi, constraint dan knowledge cutoff. Claim Autopsy adalah proses review outcome setelah jendela klaim/hasil resmi, mengacu ke Decision Entry. Outcome Review bukan sinonimnya; ia adalah langkah validasi outcome.
5. Alert event (fakta internal), notification/inbox (delivery intent per user), dan Telegram message (hasil delivery eksternal) adalah tiga objek/lifecycle berbeda.
6. Pisahkan public read API, authenticated user API, admin API dan internal job API; admin tidak memakai kredensial API publik.
7. Wallet scan (observasi chain bounded/read-only), eligibility evaluation (penerapan rules dengan bukti), claim check (pemeriksaan status/tautan/snapshot klaim) adalah proses terpisah. Jangan menampilkan “eligible” dari scan saja.
8. Pattern insight adalah statistik retrospektif dengan ambang sampel, ketidakpastian dan waktu cutoff; bukan prediksi atau expected value. “Rumor”, “speculative”, “confirmed” menjelaskan status sumber/claim, bukan jaminan reward.

## Roadmap final

Fase 0 rekonsiliasi dan baseline; Fase 1 katalog/source/evidence; Fase 2 eligibility dan wallet read-only; Fase 3 monitoring dan alert; Fase 4 quest/poin/Decision Entry; Fase 5 Outcome Review/Claim Autopsy; Fase 6 discovery dan trust; Fase 7 public API/partner/admin; Fase 8 hardening, legal dan launch. Detail prasyarat, DoD, test dan rollback berada di [SPRINT_PROMPTS.md](SPRINT_PROMPTS.md).

## Urutan gerbang

Jangan mulai fase berikutnya jika migrasi/test/privasi fase sebelumnya belum lulus. Mulai dengan fase 0; jangan menjalankan deploy production sebagai bagian dari prompt implementasi. Semua migrasi additive, terurut, diuji terhadap SQLite/D1 yang kompatibel; rollback jelas dan diuji pada salinan sebelum production. Jangan menghapus data atau melakukan destructive migration tanpa backup dan persetujuan pemilik.

## Definisi selesai global

Kode + migrasi bila perlu + test lulus + API/kontrak didokumentasikan + UI Bahasa Indonesia konsisten + privasi diuji + error handling + rate limit relevan + audit trail untuk state penting + dokumen diperbarui + klaim dibatasi + rollback jelas + tidak merusak fitur lama. Status `DEPLOYED_VERIFIED` hanya setelah verifikasi manual deployment target, bukan berdasarkan konfigurasi atau test lokal.

## Referensi

Lihat [ARCHITECTURE_TARGET.md](ARCHITECTURE_TARGET.md), [DATA_MODEL_CONSOLIDATED.md](DATA_MODEL_CONSOLIDATED.md), [GLOSSARY.md](GLOSSARY.md), [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md), [RISK_REGISTER.md](RISK_REGISTER.md), [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md), dan [SPRINT_PROMPTS.md](SPRINT_PROMPTS.md).

