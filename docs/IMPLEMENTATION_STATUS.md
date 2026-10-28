# Implementation Status — audit snapshot

**Repo:** `xirraen/airdropmuseum`, branch `main`, commit `12f5abf` (snapshot shallow clone), 2026-10-28. **Validasi lokal:** `npm ci --ignore-scripts`; `npm test` 85 pass/0 fail; `npm run build` berhasil. `npm audit` menampilkan 11 high, 0 critical. Tidak ada deployment, D1 live, secret, domain, provider atau workflow CI/CD yang diverifikasi.

Enum: `NOT_STARTED`, `PLANNED_ONLY`, `PARTIAL_IMPLEMENTED`, `IMPLEMENTED_UNTESTED`, `IMPLEMENTED_TESTED`, `DEPLOYED_VERIFIED`. Status lebih tinggi mensyaratkan seluruh aspek yang tercakup; `DEPLOYED_VERIFIED` tidak diberikan tanpa bukti operasi live. Status berikut menggambarkan fitur/area sesuai nama, bukan setiap subfungsi.

| Area | Status | Bukti | Klaim belum didukung / langkah |
|---|---|---|---|
| UI & browser-local | IMPLEMENTED_TESTED | `dist/`; `tests/app.test.mjs`, `model.test.mjs` | UI dan demo bukan katalog live/verified; browser QA manual |
| D1 server core | IMPLEMENTED_TESTED | `src/api.mjs`; `migrations/0001_core.sql`; `tests/server.test.mjs` | Test SQLite lokal bukan penerapan D1 live; jalankan migration staging |
| Auth email/wallet/Telegram | PARTIAL_IMPLEMENTED | `src/auth.mjs`, `src/platform-api.mjs`; `tests/platform.test.mjs`, `server.test.mjs` | Secret/provider & account flow live belum diverifikasi; Telegram sync terpisah |
| Telegram sync | PARTIAL_IMPLEMENTED | `src/api.mjs`; `docs/SERVER_CORE.md` | Bot secret dibutuhkan; tidak ada sinkronisasi production yang diuji |
| XP/referral ledger | IMPLEMENTED_TESTED | `src/rewards-api.mjs`, `migrations/0002_rewards.sql`, `dist/rewards.js`; `tests/rewards.test.mjs` | Local XP ≠ referral XP; bot/session untuk server rewards, bukan uang/token |
| Action Desk | IMPLEMENTED_TESTED | `dist/workbench.js`, `dist/app.js`, `tests/workbench.test.mjs` | Queue derivatif lokal; tidak auto-submit/verify |
| Campaign registry | PARTIAL_IMPLEMENTED | `dist/campaigns.js`, `migrations/0001_core.sql`, `tests/campaigns.test.mjs` | Banyak record personal/manual; shared catalog kosong awal; bukan discovery |
| Evidence/source tracking | PARTIAL_IMPLEMENTED | `dist/exhibits.js`, `dist/hunter.js`, `tests/exhibits.test.mjs`, `hunter.test.mjs` | Self-reported/local; tidak ada trust score independen |
| Eligibility rules engine airdrop | NOT_STARTED | Tidak ada rules engine kampanye; quiz/referral qualification bukan eligibility airdrop | Dilarang klaim live eligibility; buat terpisah setelah catalog/source |
| Wallet read-only scan | PARTIAL_IMPLEMENTED | `src/platform-api.mjs`, `wrangler.jsonc`, `tests/platform.test.mjs` | Portfolio manual dan quest RPC terbatas bukan pemindaian wallet universal; provider/live RPC belum dites |
| Snapshot/deadline monitor | PARTIAL_IMPLEMENTED | `dist/campaigns.js` date/check fields; `src/delivery.mjs` cron | User/editor record bukan monitor sumber otomatis |
| Claim monitor | NOT_STARTED | Tidak ada monitor klaim kampanye; claim stages manual di `dist/exhibits.js` | Tidak ada status klaim independen; rancang setelah snapshot |
| Telegram alerts | PARTIAL_IMPLEMENTED | `src/delivery.mjs`, `src/platform-api.mjs`, cron wrangler | Preferences/queue/provider adapter ada; send nyata dan bot secret belum diverifikasi |
| Quest tracker | PARTIAL_IMPLEMENTED | `dist/rewards.js`, `src/platform-api.mjs`; test hunter/platform | Local checklist/XP dan on-chain quest berbeda; catalog quest admin-defined |
| Points ledger | PARTIAL_IMPLEMENTED | `migrations/0002_rewards.sql`, `src/rewards-api.mjs`, `dist/rewards.js` | XP local/referral XP berbeda; campaign points tidak ada |
| Portfolio dashboard | IMPLEMENTED_TESTED | `dist/portfolio.js`, `tests/portfolio.test.mjs`, platform tests | Ledger manual, bukan wallet-verified balance/PnL |
| Export/backup | IMPLEMENTED_TESTED | `dist/model.js`, portfolio export; `tests/model.test.mjs`, `portfolio.test.mjs` | Export user-triggered bukan backup otomatis server/restore DR |
| Discovery automation | NOT_STARTED | Tak ada crawler/feed ingestion di repo; `docs/SERVER_CORE.md` | Ingestion mesti bounded, review-gated dan legal review |
| Source trust | NOT_STARTED | Dossier/source fields; tidak ada engine trust/cross-verification | Jangan sebut trust score, scam detector atau verified source ranking |
| Public API | PARTIAL_IMPLEMENTED | `src/api.mjs`: health/projects/exhibits/v1/airdrops; tests server | Endpoint read terbatas; belum target API publik dengan policy/version/quota docs/OpenAPI |
| Partner webhook | NOT_STARTED | Tidak ada model/route delivery partner webhook | Tidak tersedia |
| Admin console | PARTIAL_IMPLEMENTED | `src/platform-api.mjs`, `migrations/0003_platform.sql` moderation/admin routes | Moderation endpoints bukan console lengkap; exact allowlist dan live moderation belum diverifikasi |
| Feature flags | NOT_STARTED | Tidak ditemukan dalam `src`, `docs`, config | Wrangler vars ≠ feature flags |
| Maintenance mode | NOT_STARTED | Tidak ditemukan mekanisme/route/banner | Belum ada |
| Observability | PARTIAL_IMPLEMENTED | `/api/health`, `/api/capabilities`, delivery cron | Health/readiness bukan metrics, alert ops, SLO atau telemetry |
| CI/CD | NOT_STARTED | Tidak ada `.github/workflows/*`; package scripts lokal | Tambah checks hanya setelah secrets/deploy policy dirancang |
| Security hardening | PARTIAL_IMPLEMENTED | CSP/security headers di Worker, tests; `npm audit` 11 high | Belum audit independen/pentest; remediation dependency wajib |
| Legal pages | PARTIAL_IMPLEMENTED | Disclosure di UI dan `docs/PUBLIC_LAUNCH_READINESS.md` | Tidak ditemukan Privacy Policy/Terms mandiri; legal review/manual |
| Claim Autopsy | NOT_STARTED | Tidak ada code/schema/tes; tidak ada prompt lama repo | Dossier outcome bukan autopsy |
| Decision Entry | NOT_STARTED | Tidak ada entity/schema/event model/prompt repo | Compass suggestion bukan persisted decision |

## Materi yang tidak ditemukan

Tidak ada berkas prompt Sprint 1–10, Claim Autopsy, Decision Entry atau prompt konsolidasi di repo; input spesifikasi disediakan dalam lampiran pengguna. Dokumen lama yang tersedia: `ACTION_DESK_1_2.md`, `BLUEPRINT_COVERAGE.md`, `BLUEPRINT_EXECUTION.md`, `HUNTER_LAB.md`, `PUBLIC_LAUNCH_READINESS.md`, `SERVER_CORE.md`, `UI_REFERENCE_RESEARCH.md`, `UI_STRUCTURE.md`, `WHITEPAPER_ALIGNMENT.md`, `WORKBENCH_1_1.md`, `XP_AND_REFERRALS.md`. Beberapa isinya historis; README menyebut versi terbaru.

## Butuh verifikasi manual

1. Status branch/commit upstream terkini dan review perubahan setelah snapshot.
2. Terapkan migrasi berurutan pada D1 staging; periksa schema dan restore.
3. Secret/provider (Telegram bot, moderator IDs, WalletConnect, email, VAPID, RPC opsional) tanpa mencatat nilainya dalam repo/log.
4. Deploy staging, verifikasi domain/TLS, API health, auth, consent/sync, cron, opt-in delivery dan revocation.
5. Browser/mobile QA termasuk Telegram native flow; accessibility dan privacy deletion.
6. Audit dependency 11 advisories high dan security review.
7. Kebijakan legal/retensi dan disaster recovery restore drill.
