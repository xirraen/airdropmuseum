# Airdrop Museum

A mobile-first, Indonesian-language airdrop research museum deployed as `airdrop-museum` on **Cloudflare C0**. The editorial porcelain-and-teal UI is designed around evidence, provenance, lifecycle, and visitor judgment.

Public launch caveats and remaining deployment checks are documented in [docs/PUBLIC_LAUNCH_READINESS.md](docs/PUBLIC_LAUNCH_READINESS.md). UI comparison and design adaptations are in [docs/UI_REFERENCE_RESEARCH.md](docs/UI_REFERENCE_RESEARCH.md). These documents prepare the code; they do not establish that a live public domain is deployed or verified.

## Seven navigable areas

| Menu | Purpose |
| --- | --- |
| Museum | Overview, demo-data disclosures, and routes into the catalogue, archive, portfolio, and methodology |
| Galeri | Search and browse the built-in fictional samples or user-added entries by category/chain; no editorial safety ranking |
| Portofolio | Local watchlist, progress, checklists, priorities, personal notes/deadlines, and calendar/ICS tools |
| Arsip | Historical lifecycle records and a manual cost/reward ledger; outcomes remain user-reported |
| Suara Pengunjung | Private, browser-local notes and ratings; not public reviews or identity-verified reputation |
| Profil | Local profile, integration status, data/privacy controls, and full JSON backup import/export |
| Ajak | Share/copy a canonical museum link; no referral attribution, click count, points, or rewards |

Data is stored in this browser. There is no shared backend storage, authenticated login, live campaign ingestion, wallet connection, or automated eligibility verification. Six built-in projects are fictional samples; custom projects are supplied by the user and **not automatically verified**. Manual accounting is not a wallet balance. Completed research tasks do not establish eligibility.

## Development

- `npm run build` regenerates `src/worker.mjs` from `dist/`.
- `npm test` runs the model, backup, calendar and Worker route tests.
- Preview: serve `dist/` with a static HTTP server.
- Deploy: authenticated Wrangler `npx wrangler deploy`; account pinned in `wrangler.jsonc`.
- Read-only endpoints: `/api/health`, `/api/projects` (built-in demo catalog only; personal projects remain browser-local).

## Data portability

Version 1 bookmarks/checklists migrate to the version 2 data model. Full backups preserve custom projects, project management records, completed tasks and activity. Import merges bookmarks, custom projects and completed tasks; existing project management settings take precedence. Invalid custom IDs, non-HTTPS sources, oversized imports, unknown tasks and invalid accounting fields are handled at the data boundary.

The catalog supports up to 100 custom projects and 30 tasks per custom project. Project data is escaped when rendered. Do not enter credentials, seed phrases, private keys, or secrets in research notes.

## Telegram

Display SDK supports ready/expand, header/background colors and the native back button. Telegram identity is not trusted without server verification. A project bot token (stored as a Worker secret) and bot/channel usernames are still needed for verified authentication, launch-menu configuration and synchronization. Desktop browser checks do not verify native Telegram behavior.

## Version 0.3.0

Replaces repeated catalog/progress screens with six connected workflows. Adds custom-project creation, kanban stages, priority, research notes, personal deadlines, calendar navigation/ICS, archive/reopen, manual USD ledger, profile editing and complete portable backups. Existing brand and C0 deployment are retained.

## Version 0.4 — The Open Museum

See `docs/WHITEPAPER_ALIGNMENT.md` for the implemented whitepaper map. Museum-style editorial UI replaces the generic dashboard framing. Gallery, Portfolio, historical Archive and Visitor Voice form distinct workflows. Exhibit dossiers, campaign stages, local reviews and source inspection are included in portable browser-local records. Public trust scoring, crawler aggregation and public community reputation remain unimplemented and are visibly labeled.

## Version 0.5 — server core

Adds a D1-backed server foundation and private Telegram sync path, preserving the latest Ajak/privacy/UI changes. See `docs/SERVER_CORE.md` for configuration, API, migration, privacy and rollback details. The shared catalog starts empty; the six demo projects remain clearly identified. Private sync stays disabled until this project's bot secret is configured. No existing legacy database rows are migrated or exposed.

## Version 0.6 — unified product navigation

Consolidates navigation into Beranda, Jelajahi, Portofolio and Profil. Invitation sharing moves inside Profile; calendar/archive become Portfolio tools; transparency methodology becomes a Gallery tool. A shared navy/silver visual system replaces disconnected panels. Exhibit detail has three focused tabs with session draft preservation. See `docs/UI_STRUCTURE.md`. Existing D1/auth/sync behavior and local data remain compatible.

## Version 0.7 — progression, missions and bounty workbench

Portfolio is now inside Profile. Misi & Bounty adds seven local XP missions, daily activity XP, levels/streaks, eight badges, a three-question wallet-safety lesson, glossary, four planning templates and external resource cards. A separate D1 ledger implements verified Telegram referral/learning XP with idempotent rewards, self-referral rejection and a daily inviter cap. See `docs/XP_AND_REFERRALS.md` for exact rules and activation requirements. Referral rewards remain inactive until the project bot secret/session are configured; browser XP is always explicitly local and non-financial.

## Platform 1.0

The supplied aggregator/community blueprint now has a complete implementation map in [docs/BLUEPRINT_COVERAGE.md](docs/BLUEPRINT_COVERAGE.md). Network pages are nested under Jelajahi; token records and authenticated profile settings are also available from Profil. Run `npm ci`, `npm run build`, `npm test`. `npm run dev` uses an isolated in-memory SQLite database and is not a production data store. Apply migrations through `0003_platform.sql` before deploying this release. Configure exact moderator IDs, this project's bot/email credentials and WalletConnect project ID before enabling those services. Generated delivery/AI behavior always honors account opt-in and server-side quotas.

Version 1.1 adds a guest device ledger, revisioned asset edits/archive/CSV, browser session controls and local contribution drafts. See [docs/WORKBENCH_1_1.md](docs/WORKBENCH_1_1.md). Apply migration `0004_workbench.sql` before deployment.

## Action Desk 1.2

Misi & Bounty now starts with a unified personal action queue: blocked tasks, verification follow-ups, dates, source reviews and next steps. Includes combined filters, direct checklist changes, thirty-row pagination, and a previewable Markdown work plan. No database migration. See [Action Desk notes](docs/ACTION_DESK_1_2.md). Build and 85 tests pass.


## Sprint 6 — Discovery Automation

Discovery menerima RSS/Atom/JSON feed HTTPS yang ditambahkan admin, dengan normalisasi URL, klasifikasi awal, deduplikasi SHA-256, Cloudflare Queue/DLQ, cron 30 menit, dan antrean review admin berbahasa Indonesia di `/discovery.html`. **Tidak ada auto-publish**: item hanya pending review; konversi membuat draft privat (rumored/speculative) dengan evidence URL dan disclaimer verifikasi manual. Lihat [docs/DISCOVERY_AUTOMATION.md](docs/DISCOVERY_AUTOMATION.md) untuk konfigurasi, batasan ToS, pengujian, dan rollback.

## Sprint 7 — Source Trust & Cross-Verification

Source Trust melakukan penilaian platform internal terhadap sumber HTTPS yang didaftarkan admin: trust tiers, score 0–100, 12 field cross-verification, konflik material/minor/informational, audit trail, cache KV enam jam, penjadwalan setiap enam jam, dan alert Telegram untuk perubahan penting. Tab **Trust & Verifikasi** pada detail exhibit serta halaman admin **Konflik Sumber** di `/trust.html` disediakan. **Tidak ada auto-publish, verdict aman/scam, atau janji eligibility/reward.** Lihat [docs/SOURCE_TRUST.md](docs/SOURCE_TRUST.md) untuk API, model trust, batasan, deployment dan rollback.


## Sprint 8 — Public API & Partner Feed

Menambahkan API kurasi read-only berversi `/v1/`, RSS campaign/deadline, API key SHA-256 dengan tier/quota, rate limiting Cloudflare + D1, webhook partner HMAC-SHA256 dan retry/DLQ, spesifikasi OpenAPI 3.1 di `/v1/openapi.json`, serta halaman `/docs/api`. Daftar campaign publik membutuhkan `payload.visibility="public"`, sumber HTTPS, review non-draft dan catatan verifikasi yang lengkap; data user tidak pernah diserialisasi. Semua hasil dilengkapi disclaimer verifikasi manual.

Lihat [docs/PUBLIC_API.md](docs/PUBLIC_API.md) untuk autentikasi, pagination, signature, sumber RSS, retensi, pengujian, konfigurasi `PUBLIC_API_RATE_LIMITER`, `PARTNER_WEBHOOK_QUEUE`, `API_HASH_PEPPER`, `WEBHOOK_MASTER_SECRET`, dan dependensi migrasi `0012_public_api.sql`. Penggabungan seluruh branch Sprint 2–7 serta migrasi/deployment produksi **belum** dilakukan oleh Sprint 8.


## Sprint 9 — Admin Console & Operations

Konsol administrasi responsif di \`/admin\` dengan empat role (\`super_admin\`, \`admin\`, \`moderator\`, \`readonly\`), autentikasi session dan CSRF, audit trail, operasi campaign/discovery/conflict, bulk preview + konfirmasi dua langkah, API key/webhook management, feature flags dengan KV cache, maintenance mode, health checks D1/KV/Queue/provider, serta Workers Analytics Engine. Semua perubahan administratif melalui \`/api/admin/*\`. Tidak ada akses kunci rahasia dari tampilan daftar atau audit.

Migrasi: \`migrations/0013_admin_operations.sql\` (sesudah Sprint 8). Petunjuk hak akses, operasi, pengujian, rollback dan environment variable: [docs/ADMIN_OPERATIONS.md](docs/ADMIN_OPERATIONS.md). Branch Sprint 9 berbasis branch Sprint 8 yang belum digabung ke main; rekonsiliasi migrasi Sprint 2–8 wajib dilakukan sebelum produksi.


## Sprint 10 — Production Hardening & Launch

Sprint 10 adds a production security gateway (request IDs, security headers, safe structured logs, payload limits, route/IP rate controls), bounded resilient trust-source fetching, Worker observability, degraded health route `/api/aggregator/health`, four public legal/trust pages (`/privacy`, `/terms`, `/disclaimer`, `/security`), GitHub Actions CI/preview/approved deployment, a k6 staging scenario, and operational/disaster recovery documentation. Existing aggregation workflows and the Sprint 9 admin console remain the product scope.

**This is a release candidate, not a production launch confirmation.** The branch starts from unmerged Sprint 9. Production secrets, D1 migrations, branch protection, preview environment resources, restore drill, Telegram Web frame compatibility, security review, CI success and load benchmarks must be verified before release. Production workflow requires manual approval and never runs migrations implicitly.

Guides: [Production hardening](docs/PRODUCTION_HARDENING.md), [Security review](docs/SECURITY.md), [Runbook](docs/RUNBOOK.md), [Launch checklist](docs/LAUNCH_CHECKLIST.md). Run `npm ci`, `npm run lint --if-present`, `npm run typecheck --if-present`, `npm run build`, `npm test`, `node --experimental-sqlite scripts/validate-migrations.mjs`, `node scripts/security-scan.mjs` before requesting production approval.

## Sprint 11 — Claim Autopsy & Decision Intelligence

A private, Indonesian-language **Lab Keputusan** is available at `/decision-lab.html` (linked from the application header). It adds a **Decision Journal**, linked **Outcome Review**, personal **Claim Autopsy**, opt-in descriptive **Pattern Review**, UTC **Weekly Decision Review**, and public-source-only **Evidence Chain Card**.

- Every private API filters on verified `user_scope`. Per-autopsy analysis consent defaults **off**; users can withdraw it or delete their own note.
- No auto-claim, signing, eligibility guarantee, prediction, or expected-value calculation. Cohorts below five samples display **“Belum cukup data untuk pola yang dapat dipercaya”**; all insights contain their period, sample count and limitations.
- The public Evidence Chain Card uses only published, verified campaign/source metadata and never exports wallet, journal or autopsy data.
- Additive migration: `migrations/0014_claim_autopsy.sql`. Run `npm ci`, `npm run build`, and `npm test`, then perform an authenticated staging D1/Telegram integration test.
- **Integration warning:** this branch is based on Sprint 10, not `main`. Migrations 0005–0009 from earlier unmerged sprints must be reconciled before a production rollout.

See **[docs/CLAIM_AUTOPSY.md](docs/CLAIM_AUTOPSY.md)** for route contracts, ownership/consent safeguards, scope boundaries, migrations, validation, testing and deployment.

## Sprint 11 — Event-sourced Claim Autopsy Architecture

The Sprint 11 implementation is being refactored to an **append-only immutable event store** on `feat/sprint-11-event-sourced-architecture`. The source of truth is now `autopsy_events`; `claim_autopsies`, `decision_entries`, and `evidence_items` are replayable projections rather than editable user records. Claims require evidence references, explicit `knowledge_cutoff_at`, and optimistic event versions. Reversal uses `event_compensated`, not SQL DELETE.

User-facing APIs now live under `/api/autopsy/decisions`, `/api/autopsy/:id/*`, `/api/autopsy/insights/*`, and `/api/autopsy/evidence-card/:campaignSlug`. The Indonesian Lab Keputusan `/decision-lab.html` includes the replay timeline, source evidence, outcome revisions, consent, retrospectives, and shareable public-only Evidence Cards.

Analysis needs **at least 5 autopsies and 2 known outcomes per cohort**; the confidence labels `insufficient_data`, `weak_pattern`, and `moderate_pattern` describe only sample sufficiency, **not probability or forecasting strength**. No reward prediction or expected-value calculation is performed.

See [Claim Autopsy Architecture](docs/CLAIM_AUTOPSY_ARCHITECTURE.md) for the new canonical design. The older [Sprint 11 implementation notes](docs/CLAIM_AUTOPSY.md) describe the **superseded pre-event-sourcing draft** and are not deployment instructions.

**Migration warning:** This branch replaces the original never-deployed `0014_claim_autopsy.sql`. If the prior 0014 migration was applied to persistent D1, a separate forward-only 0015 migration is required; do not rewrite applied migration history. Reconcile absent earlier 0005–0009 migrations and verify staging before a production rollout.


## Production completion continuation (28 October 2026)

The candidate now restores Aggregator/Quest/Portfolio API and UI integration and adds forward-only migration 0015 for decision-first registry follow. Local build/tests pass; production dependency audit still reports 11 high vulnerabilities. **PRODUCTION BLOCKED: no production migration or deployment performed.** See [implementation evidence](docs/IMPLEMENTATION_MATRIX.md) and [current release gates](docs/SPRINT11_PRODUCTION_RELEASE.md). Run the build before tests to regenerate Worker assets.


### Latest verified candidate

The dependency blocker is resolved locally (zero audit findings). The candidate passes 239 unit/integration tests, source syntax lint, strict wallet-adapter typecheck, 15 migrations, and real workerd/local D1 checks. Run `npm run test:runtime` for the isolated synthetic runtime suite. Wallet connections are read-only; account authentication uses Telegram/email. Production is not deployed: remote staging, credentials, private backup/restore, real mobile/wallet tests and protected environment gates remain. See the updated release report.
